import { act } from "react";
import { createRoot } from "react-dom/client";
import { FreezePackShop } from "./Profile";
import { useAuth } from "@/context/AuthContext";
import { getFreezePackPrice, nativePlatform, purchaseFreezePack } from "@/lib/iap";

jest.mock("@/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/iap", () => ({
  nativePlatform: jest.fn(),
  getFreezePackPrice: jest.fn(),
  purchaseFreezePack: jest.fn(),
  restorePurchases: jest.fn(),
  IAP_PRODUCTS: { FREEZE_PACK_5: { id: "rmc.freeze.pack5" } },
}));
jest.mock("@/lib/sound", () => ({ sfx: { click: jest.fn() } }));
jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock("react-router-dom", () => ({ Link: () => null }));
jest.mock("@/lib/games", () => ({ GAMES: [] }));
jest.mock("@/lib/notifications", () => ({}));
jest.mock("@/components/rmc/Badge", () => ({ BadgeShelf: () => null }));
jest.mock("@/components/rmc/ThemePicker", () => () => null);
jest.mock("@/components/rmc/AccountRefreshNotice", () => () => null);

let container, root, currentUser;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const buy = () => container.querySelector('[data-testid="freeze-buy-btn"]');
const restore = () => container.querySelector('[data-testid="freeze-restore-btn"]');
const render = async () => act(async () => { root.render(<FreezePackShop />); });
const click = async (button) => act(async () => { button.click(); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  currentUser = { id: "account-A", freezes_available: 0 };
  useAuth.mockImplementation(() => ({ user: currentUser, refresh: jest.fn() }));
  nativePlatform.mockReturnValue("ios");
  purchaseFreezePack.mockResolvedValue({ ok: false, cancelled: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  global.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test("loads localized price, keeps restore available, purchases only on explicit click", async () => {
  const pending = deferred();
  getFreezePackPrice.mockReturnValue(pending.promise);
  await render();
  expect(buy().disabled).toBe(true);
  expect(buy().textContent).toContain("Loading price");
  expect(restore().disabled).toBe(false);
  await act(async () => pending.resolve("1,19 €"));
  expect(buy().textContent).toContain("Buy · 1,19 €");
  expect(buy().disabled).toBe(false);
  expect(purchaseFreezePack).not.toHaveBeenCalled();
  await click(buy());
  expect(purchaseFreezePack).toHaveBeenCalledTimes(1);
});

test("missing price offers retry without initiating a transaction", async () => {
  getFreezePackPrice.mockResolvedValueOnce(null).mockResolvedValueOnce("¥150");
  await render();
  expect(buy().textContent).toContain("Retry store price");
  await click(buy());
  expect(getFreezePackPrice).toHaveBeenCalledTimes(2);
  expect(purchaseFreezePack).not.toHaveBeenCalled();
  expect(buy().textContent).toContain("Buy · ¥150");
});

test("timeout rejects late first result after successful retry", async () => {
  const slow = deferred();
  getFreezePackPrice.mockReturnValueOnce(slow.promise).mockResolvedValueOnce("£0.99");
  await render();
  await act(async () => jest.advanceTimersByTime(12000));
  expect(buy().textContent).toContain("Retry store price");
  await click(buy());
  expect(buy().textContent).toContain("Buy · £0.99");
  await act(async () => slow.resolve("$99.00"));
  expect(buy().textContent).toContain("Buy · £0.99");
  expect(purchaseFreezePack).not.toHaveBeenCalled();
});

test("switching accounts discards the old account price result", async () => {
  const old = deferred();
  const next = deferred();
  getFreezePackPrice.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  await render();
  currentUser = { id: "account-B" };
  await render();
  expect(buy().disabled).toBe(true);
  await act(async () => old.resolve("$99.00"));
  expect(buy().textContent).toContain("Loading price");
  await act(async () => next.resolve("€0,99"));
  expect(buy().textContent).toContain("Buy · €0,99");
  expect(getFreezePackPrice).toHaveBeenLastCalledWith("account-B");
});

test("web never requests a native price or enables purchase and restore", async () => {
  nativePlatform.mockReturnValue("");
  await render();
  expect(buy().textContent).toContain("Mobile App Only");
  expect(buy().disabled).toBe(true);
  expect(restore().disabled).toBe(true);
  expect(getFreezePackPrice).not.toHaveBeenCalled();
  expect(purchaseFreezePack).not.toHaveBeenCalled();
});
