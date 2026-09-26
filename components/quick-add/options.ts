/**
 * Quick Add menu structure (P0-E5-S2). RECORD actions open Money's own
 * forms inside the modal (`view`); PLAN actions route to the existing
 * canonical screens — no duplicate Budget/Goal/Obligation implementation
 * lives here.
 */
export type QuickAddIconKey = "received" | "spent" | "move" | "asset" | "budget" | "goal" | "commitment";

export interface QuickAddOptionConfig {
  key: string;
  title: string;
  description: string;
  icon: QuickAddIconKey;
  /** Opens an in-modal Money form. */
  view?: "received" | "spent" | "move";
  /** Routes to an existing canonical screen. */
  href?: string;
}

export interface QuickAddGroupConfig {
  heading: "Record" | "Plan";
  /** Record actions need a cash bucket to write against; Plan actions do not. */
  requiresBucket: boolean;
  options: QuickAddOptionConfig[];
}

export const QUICK_ADD_TITLE = "Quick Add";
export const QUICK_ADD_SUBTITLE = "What would you like to do?";

export const QUICK_ADD_GROUPS: QuickAddGroupConfig[] = [
  {
    heading: "Record",
    requiresBucket: true,
    options: [
      { key: "received", title: "Money Received", description: "Salary, income, refunds.", icon: "received", view: "received" },
      { key: "spent", title: "Money Spent", description: "Everyday spending and bills.", icon: "spent", view: "spent" },
      { key: "move", title: "Move Money", description: "Between your own accounts.", icon: "move", view: "move" },
      { key: "asset", title: "Asset / Investment", description: "Something you own or invested in.", icon: "asset", href: "/assets#add-asset" },
    ],
  },
  {
    heading: "Plan",
    requiresBucket: false,
    options: [
      { key: "budget", title: "Budget", description: "Plan what you'll spend this month.", icon: "budget", href: "/budget?quick=1" },
      { key: "goal", title: "Goal", description: "Save toward something.", icon: "goal", href: "/goals?new=1" },
      { key: "commitment", title: "Commitment", description: "A payment you know is coming.", icon: "commitment", href: "/rules?add=commitment" },
    ],
  },
];
