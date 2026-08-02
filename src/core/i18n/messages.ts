import type { Locale } from "./locale";

/**
 * Interface copy.
 *
 * Lives in core rather than the UI layer so the future mobile app shares one
 * vocabulary with the website. An action keeps the same name everywhere it
 * appears -- the button, the badge, and the admin control that produces it.
 */
/**
 * Fills {placeholders}. Templates are plain strings rather than functions so
 * the whole message object stays serialisable: React Server Components refuse
 * to pass functions to client components, and the future mobile app will want
 * this as data too.
 */
export function interpolate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export interface Messages {
  openNow: string;
  closed: string;
  /** "{time}" */
  closesAt: string;
  /** "{day} {time}" */
  opensAt: string;
  hoursUnset: string;

  searchLabel: string;
  searchPlaceholder: string;
  noMatches: string;
  clearSearch: string;

  soldOut: string;
  from: string;

  findUs: string;
  hours: string;
  call: string;
  whatsapp: string;
  directions: string;

  switchLanguage: string;
  menuEmpty: string;

  days: readonly string[];
  badges: Record<string, string>;
}

const EN: Messages = {
  openNow: "Open now",
  closed: "Closed",
  closesAt: "Closes {time}",
  opensAt: "Opens {day} {time}",
  hoursUnset: "Hours not listed",

  searchLabel: "Search the menu",
  // Short enough not to truncate in the narrow phone rail; the full meaning
  // lives in searchLabel, which is what screen readers announce.
  searchPlaceholder: "Search",
  noMatches: "No dishes match that search.",
  clearSearch: "Clear",

  soldOut: "Sold out",
  from: "from",

  findUs: "Find us",
  hours: "Opening hours",
  call: "Call",
  whatsapp: "WhatsApp",
  directions: "Directions",

  switchLanguage: "العربية",
  menuEmpty: "This menu is being updated.",

  days: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  badges: {
    spicy: "Spicy",
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    new: "New",
  },
};

const AR: Messages = {
  openNow: "مفتوح الآن",
  closed: "مغلق",
  closesAt: "يغلق {time}",
  opensAt: "يفتح {day} {time}",
  hoursUnset: "أوقات العمل غير محددة",

  searchLabel: "ابحث في القائمة",
  searchPlaceholder: "بحث",
  noMatches: "لا توجد أطباق مطابقة.",
  clearSearch: "مسح",

  soldOut: "غير متوفر",
  from: "من",

  findUs: "زورونا",
  hours: "أوقات العمل",
  call: "اتصل",
  whatsapp: "واتساب",
  directions: "الاتجاهات",

  switchLanguage: "English",
  menuEmpty: "يتم تحديث القائمة.",

  days: [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ],
  badges: {
    spicy: "حار",
    vegetarian: "نباتي",
    vegan: "نباتي صرف",
    new: "جديد",
  },
};

export function getMessages(locale: Locale): Messages {
  return locale === "ar" ? AR : EN;
}
