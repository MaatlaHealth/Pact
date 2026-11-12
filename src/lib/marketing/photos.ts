/**
 * Photography used on the public site. All images are hotlinked from Unsplash
 * under the Unsplash License and credited in the site footer.
 */
export interface Photo {
  src: string;
  alt: string;
  credit: string;
  creditUrl: string;
  width: number;
  height: number;
}

function unsplash(id: string, w: number, h: number, extra = "") {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=75${extra}`;
}

export const PHOTOS = {
  hero: {
    src: unsplash("photo-1494412519320-aa613dfb7738", 1400, 1600),
    alt: "Aerial view of a container yard, rows of coloured shipping containers crossed by two service roads",
    credit: "CHUTTERSNAP",
    creditUrl: "https://unsplash.com/photos/aerial-view-of-shipping-container-yard-9cCeS9Sg6nU",
    width: 1400,
    height: 1600,
  },
  verification: {
    src: unsplash("photo-1581092160562-40aa08e78837", 1400, 1050),
    alt: "An engineer measuring technical drawings on a desk with a caliper",
    credit: "ThisisEngineering",
    creditUrl: "https://unsplash.com/photos/engineer-measuring-technical-drawings-on-desk-WDCE0T4khsE",
    width: 1400,
    height: 1050,
  },
  receipts: {
    src: unsplash("photo-1702825342393-b0e0cd3e9529", 1400, 1050),
    alt: "Close-up of postage stamps arranged in an album",
    credit: "Tolga deniz Aran",
    creditUrl: "https://unsplash.com/photos/a-close-up-of-a-number-of-stamps-on-a-table-Tx26sTme-58",
    width: 1400,
    height: 1050,
  },
  facade: {
    src: unsplash("photo-1764083292901-bd84dea585aa", 1400, 1600),
    alt: "A modern blue glass building facade with repeating geometric panels",
    credit: "Hiroya Nakashima",
    creditUrl: "https://unsplash.com/photos/modern-blue-glass-building-facade-with-geometric-patterns-_gS7JgfT_Rc",
    width: 1400,
    height: 1600,
  },
  facadeWide: {
    src: unsplash("photo-1764083292901-bd84dea585aa", 2000, 900),
    alt: "A modern blue glass building facade with repeating geometric panels",
    credit: "Hiroya Nakashima",
    creditUrl: "https://unsplash.com/photos/modern-blue-glass-building-facade-with-geometric-patterns-_gS7JgfT_Rc",
    width: 2000,
    height: 900,
  },
} satisfies Record<string, Photo>;

export const PHOTO_CREDITS: Photo[] = [PHOTOS.hero, PHOTOS.verification, PHOTOS.receipts, PHOTOS.facade];
