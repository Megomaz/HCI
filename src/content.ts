/** Synthetic demo content. Wording is fixed by PLAN.md §6 — do not edit. */

export const ORIGINAL_SENTENCES: readonly string[] = [
  "Applicants must furnish documentary evidence of all means, including self-employment income for the preceding 12-month period, together with proof of residency.",
  "Where the applicant's circumstances have materially altered since the previous assessment, supplementary documentation may be required.",
];

/** Same shape the live-mode API returns (Milestone 5). */
export interface Checklist {
  mustHave: string[];
  optional: string[];
  onlyIfNeeded: string[];
}

export type SectionKey = keyof Checklist;

export const SECTIONS: readonly { key: SectionKey; title: string }[] = [
  { key: "mustHave", title: "Must have" },
  { key: "optional", title: "Optional" },
  { key: "onlyIfNeeded", title: "Only if needed" },
];

export const DEMO_CHECKLIST: Checklist = {
  mustHave: [
    "Proof of your income for the last 12 months (for example, your tax return)",
    "Proof of your address (for example, a recent bill)",
  ],
  optional: ["A letter from your accountant, if you have one"],
  onlyIfNeeded: [
    "If your income or home changed since last year, send proof of the change",
  ],
};
