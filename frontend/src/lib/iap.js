/**
 * In-App Purchases via RevenueCat (Capacitor).
 *
 * Products:
 *   FREEZE_PACK_5  - Consumable, $0.99, grants 5 streak freezes.
 *
 * Flow:
 *   1. configureIAP(user)      - call once after login (no-op on web)
 *   2. purchaseFreezePack()    - user taps "Buy 5-Pack"
 *   3. Backend /api/iap/sync   - client asks backend to credit any un-processed
 *                                purchases by querying RevenueCat with our secret key.
 *
 * Backend, not the client, is the source of truth for granted freezes.
 */
import api from "@/lib/api";

const REVENUECAT_KEYS = {
  ios: process.env.REACT_APP_REVENUECAT_IOS_KEY || "",
  android: process.env.REACT_APP_REVENUECAT_ANDROID_KEY || "",
};

export const IAP_PRODUCTS = {
  FREEZE_PACK_5: {
    id: "rmc.freeze.pack5",
    label: "5 Streak Freezes",
    price: "$0.99",
    freezes: 5,
  },
};

let configured = false;
let configuredUserId = "";
let cachedPurchases = null;

function nativePlatform() {
  try {
    if (typeof window === "undefined" || !window.Capacitor?.isNativePlatform?.()) {
      return "";
    }
    return window.Capacitor.getPlatform?.() || "";
  } catch {
    return "";
  }
}

function isNative() {
  return nativePlatform() === "ios" || nativePlatform() === "android";
}

export function revenueCatKeyForPlatform(platform = nativePlatform()) {
  const key = REVENUECAT_KEYS[platform] || "";
  const requiredPrefix = platform === "ios"
    ? "appl_"
    : platform === "android"
      ? "goog_"
      : "";
  return requiredPrefix && key.startsWith(requiredPrefix) ? key : "";
}

async function getPurchases() {
  if (cachedPurchases) return cachedPurchases;
  try {
    const mod = await import("@revenuecat/purchases-capacitor");
    cachedPurchases = mod.Purchases;
    return cachedPurchases;
  } catch {
    return null;
  }
}

/** Configure RevenueCat with the logged-in user's stable ID. Call from AuthContext once user is known. */
export async function configureIAP(userId) {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  const revenueCatKey = revenueCatKeyForPlatform();
  if (!isNative() || !normalizedUserId || !revenueCatKey) return false;
  if (configured) {
    if (configuredUserId === normalizedUserId) return true;
    // Never leave paid actions enabled for a provider session bound to a
    // different local account. A fresh native session must reconfigure it.
    configured = false;
    configuredUserId = "";
    return false;
  }
  const Purchases = await getPurchases();
  if (!Purchases) return false;
  try {
    await Purchases.configure({ apiKey: revenueCatKey, appUserID: normalizedUserId });
    configured = true;
    configuredUserId = normalizedUserId;
    return true;
  } catch (err) {
    console.warn("RevenueCat configure failed");
    return false;
  }
}

/** Buy the 5-pack. Returns { ok, freezes_available? } or { ok: false, error }. */
export async function purchaseFreezePack() {
  if (!isNative()) {
    return { ok: false, error: "In-app purchases are only available in the mobile app." };
  }
  if (!revenueCatKeyForPlatform() || !configured || !configuredUserId) {
    return { ok: false, error: "Purchases are temporarily unavailable." };
  }
  const Purchases = await getPurchases();
  if (!Purchases) return { ok: false, error: "Store unavailable" };
  try {
    // Fetch product from the store
    const { products } = await Purchases.getProducts({
      productIdentifiers: [IAP_PRODUCTS.FREEZE_PACK_5.id],
    });
    const product = products?.find(
      (candidate) => candidate?.identifier === IAP_PRODUCTS.FREEZE_PACK_5.id,
    );
    if (!product) return { ok: false, error: "Product not found. Try again shortly." };

    // Purchase. Once this resolves, payment is confirmed by the store.
    await Purchases.purchaseStoreProduct({ product });
  } catch (err) {
    // User-cancel is not an error to us.
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes("cancel")) return { ok: false, cancelled: true };
    console.warn("purchaseFreezePack failed");
    return {
      ok: false,
      error: "Purchase could not be completed. Try again.",
    };
  }

  try {
    // Backend syncs with RevenueCat and credits freezes.
    const { data } = await api.post("/iap/sync", {
      product_id: IAP_PRODUCTS.FREEZE_PACK_5.id,
    });
    return { ok: true, freezes_available: data.freezes_available, credited: data.credited };
  } catch (err) {
    // Do not report a paid transaction as a failed purchase. RevenueCat's webhook
    // can still deliver it, and Restore Purchases safely retries the account sync.
    console.warn("Freeze pack purchased; credit sync pending");
    return {
      ok: true,
      pending: true,
      credited: 0,
      error: "Payment received. Your freezes are still syncing—tap Restore Purchases shortly.",
    };
  }
}

/** Restore purchases button - required by Apple for consumables tied to a user account. */
export async function restorePurchases() {
  if (!isNative()) return { ok: false, error: "Only available in the mobile app." };
  if (!revenueCatKeyForPlatform() || !configured || !configuredUserId) {
    return { ok: false, error: "Purchases are temporarily unavailable." };
  }
  const Purchases = await getPurchases();
  if (!Purchases) return { ok: false, error: "Store unavailable" };
  try {
    await Purchases.restorePurchases();
    const { data } = await api.post("/iap/sync", { product_id: IAP_PRODUCTS.FREEZE_PACK_5.id });
    return { ok: true, freezes_available: data.freezes_available, credited: data.credited };
  } catch (err) {
    console.warn("restorePurchases failed");
    return {
      ok: false,
      error: "Restore could not be completed. Try again.",
    };
  }
}
