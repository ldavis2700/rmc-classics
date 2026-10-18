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
let cachedProductCategory = null;
let configurationGeneration = 0;
let configurationQueue = Promise.resolve();

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

function validatedSyncPayload(data) {
  const freezesAvailable = data?.freezes_available;
  const credited = data?.credited;
  if (
    !Number.isSafeInteger(freezesAvailable)
    || freezesAvailable < 0
    || !Number.isSafeInteger(credited)
    || credited < 0
  ) {
    return null;
  }
  return { freezes_available: freezesAvailable, credited };
}

async function getPurchases() {
  if (cachedPurchases) return cachedPurchases;
  try {
    const mod = await import("@revenuecat/purchases-capacitor");
    cachedPurchases = mod.Purchases;
    cachedProductCategory = mod.PRODUCT_CATEGORY;
    return cachedPurchases;
  } catch {
    return null;
  }
}

function normalizedIAPUserId(userId) {
  if (typeof userId !== "string") return "";
  const value = userId.trim();
  const hasOuterWhitespace = value !== userId;
  const hasControlCharacter = /[\p{Cc}\p{Cf}]/u.test(value);
  const hasWhitespace = /\s/u.test(value);
  const hasUnstableUnicodeNormalization = value.normalize("NFC") !== value;
  if (
    !value
    || hasOuterWhitespace
    || value.length > 256
    || hasControlCharacter
    || hasWhitespace
    || hasUnstableUnicodeNormalization
  ) return "";
  return value;
}

/** Configure one serialized RevenueCat identity request. */
async function configureIAPRequest(userId, requestGeneration) {
  const normalizedUserId = normalizedIAPUserId(userId);
  const revenueCatKey = revenueCatKeyForPlatform();
  if (!isNative()) return false;
  if (!normalizedUserId || !revenueCatKey) {
    if (requestGeneration === configurationGeneration) configuredUserId = "";
    return false;
  }
  const Purchases = await getPurchases();
  if (!Purchases || requestGeneration !== configurationGeneration) return false;
  if (configured) {
    if (configuredUserId === normalizedUserId) return true;
    try {
      await Purchases.logIn({ appUserID: normalizedUserId });
      if (requestGeneration !== configurationGeneration) return false;
      configuredUserId = normalizedUserId;
      return true;
    } catch {
      if (requestGeneration === configurationGeneration) configuredUserId = "";
      console.warn("RevenueCat user switch failed");
      return false;
    }
  }
  try {
    await Purchases.configure({ apiKey: revenueCatKey, appUserID: normalizedUserId });
    // The SDK is configured even if a newer queued identity superseded this
    // request while configure was in flight. Preserve that provider state so
    // the newer request switches with logIn instead of configuring twice.
    configured = true;
    if (requestGeneration !== configurationGeneration) return false;
    configuredUserId = normalizedUserId;
    return true;
  } catch {
    if (requestGeneration === configurationGeneration) configuredUserId = "";
    console.warn("RevenueCat configure failed");
    return false;
  }
}

/** Configure RevenueCat with the logged-in user's stable ID. */
export async function configureIAP(userId) {
  const normalizedUserId = normalizedIAPUserId(userId);
  const requestGeneration = ++configurationGeneration;
  if (configuredUserId !== normalizedUserId) {
    // Disable paid actions immediately while a different account identity is
    // waiting behind any in-flight provider operation.
    configuredUserId = "";
  }
  const request = () => configureIAPRequest(normalizedUserId, requestGeneration);
  const result = configurationQueue.then(request, request);
  configurationQueue = result.then(() => undefined, () => undefined);
  return result;
}

/** Disable paid actions when the local authenticated session ends. */
export function suspendIAP() {
  configurationGeneration += 1;
  configuredUserId = "";
}

function iapSessionStillActive(userId, generation) {
  return Boolean(
    configured
    && userId
    && configuredUserId === userId
    && generation === configurationGeneration
  );
}

function pendingCreditSyncResult() {
  return {
    ok: true,
    pending: true,
    credited: 0,
    error: "Payment received. Your freezes are still syncing—sign in to the purchasing account and tap Restore Purchases shortly.",
  };
}

/** Buy the 5-pack. Returns { ok, freezes_available? } or { ok: false, error }. */
export async function purchaseFreezePack() {
  if (!isNative()) {
    return { ok: false, error: "In-app purchases are only available in the mobile app." };
  }
  if (!revenueCatKeyForPlatform() || !configured || !configuredUserId) {
    return { ok: false, error: "Purchases are temporarily unavailable." };
  }
  const purchaseUserId = configuredUserId;
  const purchaseGeneration = configurationGeneration;
  const Purchases = await getPurchases();
  if (!Purchases || cachedProductCategory?.NON_SUBSCRIPTION == null) {
    return { ok: false, error: "Store unavailable" };
  }
  if (!iapSessionStillActive(purchaseUserId, purchaseGeneration)) {
    return { ok: false, error: "Your account changed. Start the purchase again." };
  }
  try {
    // This SKU is a consumable. RevenueCat defaults Android lookups to
    // subscriptions unless the non-subscription category is explicit.
    const { products } = await Purchases.getProducts({
      productIdentifiers: [IAP_PRODUCTS.FREEZE_PACK_5.id],
      type: cachedProductCategory.NON_SUBSCRIPTION,
    });
    const product = products?.find(
      (candidate) => candidate?.identifier === IAP_PRODUCTS.FREEZE_PACK_5.id,
    );
    if (!product) return { ok: false, error: "Product not found. Try again shortly." };
    if (!iapSessionStillActive(purchaseUserId, purchaseGeneration)) {
      return { ok: false, error: "Your account changed. Start the purchase again." };
    }

    // Purchase. Once this resolves, payment is confirmed by the store.
    await Purchases.purchaseStoreProduct({ product });
  } catch (err) {
    if (!iapSessionStillActive(purchaseUserId, purchaseGeneration)) {
      return { ok: false, error: "Your account changed. Start the purchase again." };
    }
    // Trust the SDK's explicit cancellation flag. Message matching is both
    // locale-dependent and can misclassify errors that merely mention cancellation.
    if (err?.userCancelled === true) return { ok: false, cancelled: true };
    console.warn("purchaseFreezePack failed");
    return {
      ok: false,
      error: "Purchase could not be completed. Try again.",
    };
  }

  if (!iapSessionStillActive(purchaseUserId, purchaseGeneration)) {
    // Never sync a completed store transaction through a different local
    // account. The purchasing account can reconcile it through Restore.
    return pendingCreditSyncResult();
  }

  try {
    // Backend syncs with RevenueCat and credits freezes.
    const { data } = await api.post("/iap/sync", {
      product_id: IAP_PRODUCTS.FREEZE_PACK_5.id,
    });
    if (!iapSessionStillActive(purchaseUserId, purchaseGeneration)) {
      return pendingCreditSyncResult();
    }
    const sync = validatedSyncPayload(data);
    if (!sync) throw new Error("invalid_iap_sync_response");
    return { ok: true, ...sync };
  } catch (err) {
    // Do not report a paid transaction as a failed purchase. RevenueCat's webhook
    // can still deliver it, and Restore Purchases safely retries the account sync.
    console.warn("Freeze pack purchased; credit sync pending");
    return pendingCreditSyncResult();
  }
}

/** Restore purchases button - required by Apple for consumables tied to a user account. */
export async function restorePurchases() {
  if (!isNative()) return { ok: false, error: "Only available in the mobile app." };
  if (!revenueCatKeyForPlatform() || !configured || !configuredUserId) {
    return { ok: false, error: "Purchases are temporarily unavailable." };
  }
  const restoreUserId = configuredUserId;
  const restoreGeneration = configurationGeneration;
  const Purchases = await getPurchases();
  if (!Purchases) return { ok: false, error: "Store unavailable" };
  if (!iapSessionStillActive(restoreUserId, restoreGeneration)) {
    return { ok: false, error: "Your account changed. Start restore again." };
  }
  try {
    await Purchases.restorePurchases();
    if (!iapSessionStillActive(restoreUserId, restoreGeneration)) {
      return { ok: false, error: "Your account changed. Sign in and restore again." };
    }
    const { data } = await api.post("/iap/sync", { product_id: IAP_PRODUCTS.FREEZE_PACK_5.id });
    if (!iapSessionStillActive(restoreUserId, restoreGeneration)) {
      return { ok: false, error: "Your account changed. Sign in and restore again." };
    }
    const sync = validatedSyncPayload(data);
    if (!sync) throw new Error("invalid_iap_sync_response");
    return { ok: true, ...sync };
  } catch (err) {
    if (!iapSessionStillActive(restoreUserId, restoreGeneration)) {
      return { ok: false, error: "Your account changed. Sign in and restore again." };
    }
    console.warn("restorePurchases failed");
    return {
      ok: false,
      error: "Restore could not be completed. Try again.",
    };
  }
}
