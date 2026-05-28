/**
 * Kijiji Mingle API client — TypeScript port
 *
 * Uses Kijiji's undocumented mobile API at mingle.kijiji.ca.
 * Endpoints are XML-based (eBay Classifieds Group schema).
 */

const MINGLE_BASE = "https://mingle.kijiji.ca/api";

const COMMON_HEADERS: Record<string, string> = {
  accept: "*/*",
  "x-ecg-ver": "1.67",
  "x-ecg-ab-test-group": "",
  "accept-language": "en-CA",
  "accept-encoding": "gzip",
  "user-agent": "Kijiji 17.4.0 (iPhone; iOS 17.4; en_CA)",
};

// Calgary location ID on Kijiji
const CALGARY_LOCATION_ID = "1700199";
// Cars & Trucks category
const CARS_TRUCKS_CATEGORY_ID = "174";

export interface KijijiSession {
  userId: string;
  token: string;
  email: string;
}

export interface KijijiAdPayload {
  title: string;
  description: string;
  price: number | null;
  categoryId?: string;
  locationId?: string;
  postalCode?: string;
  address?: string;
  attributes?: KijijiAdAttribute[];
}

export interface KijijiAdAttribute {
  name: string;
  value: string;
  localeValue?: string;
}

export interface KijijiPostedAd {
  adId: string;
  title: string;
  status: string;
}

function authHeader(session: KijijiSession): string {
  return `id="${session.userId}", token="${session.token}"`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildAdXml(payload: KijijiAdPayload, email: string): string {
  const categoryId = payload.categoryId || CARS_TRUCKS_CATEGORY_ID;
  const locationId = payload.locationId || CALGARY_LOCATION_ID;
  const postalCode = payload.postalCode || "T2Z5E1";
  const address = payload.address || "Calgary, AB, Canada";

  let priceXml = "";
  if (payload.price != null && payload.price > 0) {
    priceXml = `
    <ad:price>
      <types:price-type>
        <types:value>SPECIFIED_AMOUNT</types:value>
      </types:price-type>
      <types:amount>${payload.price.toFixed(2)}</types:amount>
      <types:currency-iso-code>
        <types:value>CAD</types:value>
      </types:currency-iso-code>
    </ad:price>`;
  } else {
    priceXml = `
    <ad:price>
      <types:price-type>
        <types:value>PLEASE_CONTACT</types:value>
      </types:price-type>
    </ad:price>`;
  }

  let attributesXml = "";
  if (payload.attributes && payload.attributes.length > 0) {
    const attrEntries = payload.attributes
      .map(
        (a) => `
      <attr:attribute name="${escapeXml(a.name)}">
        <attr:value>${escapeXml(a.value)}</attr:value>
        ${a.localeValue ? `<attr:locale-value>${escapeXml(a.localeValue)}</attr:locale-value>` : ""}
      </attr:attribute>`
      )
      .join("");
    attributesXml = `<attr:attributes>${attrEntries}
    </attr:attributes>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ad:ad xmlns:types="http://www.ebayclassifiedsgroup.com/schema/types/v1"
       xmlns:cat="http://www.ebayclassifiedsgroup.com/schema/category/v1"
       xmlns:loc="http://www.ebayclassifiedsgroup.com/schema/location/v1"
       xmlns:ad="http://www.ebayclassifiedsgroup.com/schema/ad/v1"
       xmlns:attr="http://www.ebayclassifiedsgroup.com/schema/attribute/v1"
       xmlns:pic="http://www.ebayclassifiedsgroup.com/schema/picture/v1"
       xmlns:user="http://www.ebayclassifiedsgroup.com/schema/user/v1"
       xmlns:rate="http://www.ebayclassifiedsgroup.com/schema/rate/v1"
       xmlns:reply="http://www.ebayclassifiedsgroup.com/schema/reply/v1"
       locale="en-CA">
    <ad:title>${escapeXml(payload.title)}</ad:title>
    <ad:description>${escapeXml(payload.description)}</ad:description>
    <ad:email>${escapeXml(email)}</ad:email>
    <ad:ad-type>
      <ad:value>OFFER</ad:value>
    </ad:ad-type>
    <cat:category id="${categoryId}" />
    <loc:locations>
      <loc:location id="${locationId}" />
    </loc:locations>
    <ad:ad-address>
      <types:zip-code>${escapeXml(postalCode)}</types:zip-code>
      <types:full-address>${escapeXml(address)}</types:full-address>
    </ad:ad-address>
    ${priceXml}
    ${attributesXml}
</ad:ad>`;
}

function extractXmlValue(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractIdAttribute(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*\\sid="([^"]*)"`, "i");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Login to Kijiji and return a session with userId + token.
 */
export async function kijijiLogin(
  email: string,
  password: string
): Promise<KijijiSession> {
  const url = `${MINGLE_BASE}/users/login`;

  const body = new URLSearchParams({
    username: email,
    password,
    socialAutoRegistration: "false",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kijiji login failed (${res.status}): ${text}`);
  }

  const xml = await res.text();
  const userId =
    extractXmlValue(xml, "user:id") ??
    extractIdAttribute(xml, "user:user-login");
  const token = extractXmlValue(xml, "user:token");

  if (!userId || !token) {
    throw new Error("Kijiji login response missing userId or token");
  }

  return { userId, token, email };
}

/**
 * Post a new ad on Kijiji.
 */
export async function kijijiPostAd(
  session: KijijiSession,
  payload: KijijiAdPayload
): Promise<KijijiPostedAd> {
  const url = `${MINGLE_BASE}/users/${session.userId}/ads`;
  const xmlBody = buildAdXml(payload, session.email);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "content-type": "application/xml",
      "x-ecg-authorization-user": authHeader(session),
    },
    body: xmlBody,
  });

  if (res.status !== 201) {
    const text = await res.text();
    throw new Error(`Kijiji post ad failed (${res.status}): ${text}`);
  }

  const xml = await res.text();
  const adId = extractIdAttribute(xml, "ad:ad") ?? "unknown";

  return {
    adId,
    title: payload.title,
    status: "posted",
  };
}

/**
 * Delete an ad from Kijiji.
 */
export async function kijijiDeleteAd(
  session: KijijiSession,
  adId: string
): Promise<boolean> {
  const url = `${MINGLE_BASE}/users/${session.userId}/ads/${adId}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      ...COMMON_HEADERS,
      "content-type": "application/xml",
      "x-ecg-authorization-user": authHeader(session),
    },
  });

  return res.status === 204;
}

/**
 * List all active ads for the logged-in user.
 */
export async function kijijiListAds(
  session: KijijiSession
): Promise<KijijiPostedAd[]> {
  const url = `${MINGLE_BASE}/users/${session.userId}/ads`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...COMMON_HEADERS,
      "x-ecg-authorization-user": authHeader(session),
    },
  });

  if (!res.ok) {
    throw new Error(`Kijiji list ads failed (${res.status})`);
  }

  const xml = await res.text();
  const ads: KijijiPostedAd[] = [];

  const adBlocks = xml.split(/<ad:ad\s/g);
  for (const block of adBlocks.slice(1)) {
    const adId = block.match(/id="([^"]+)"/)?.[1] ?? "";
    const title = extractXmlValue(block, "ad:title") ?? "";
    const status = extractXmlValue(block, "ad:status") ?? "active";
    if (adId) {
      ads.push({ adId, title, status });
    }
  }

  return ads;
}

export interface KijijiConversation {
  conversationId: string;
  adId: string;
  adTitle: string;
  buyerName: string;
  buyerEmail: string;
  lastMessage: string;
  unread: boolean;
}

/**
 * List conversations (inquiries) for the logged-in user.
 */
export async function kijijiGetConversations(
  session: KijijiSession,
  page = 0
): Promise<KijijiConversation[]> {
  const url = `${MINGLE_BASE}/users/${session.userId}/conversations?size=25&page=${page}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...COMMON_HEADERS,
      "x-ecg-authorization-user": authHeader(session),
    },
  });

  if (!res.ok) {
    throw new Error(`Kijiji get conversations failed (${res.status})`);
  }

  const xml = await res.text();
  const conversations: KijijiConversation[] = [];

  const blocks = xml.split(/<user:user-conversation\s/g);
  for (const block of blocks.slice(1)) {
    const conversationId = block.match(/id="([^"]+)"/)?.[1] ?? "";
    const adId = extractXmlValue(block, "user:ad-id") ?? "";
    const adTitle = extractXmlValue(block, "user:ad-title") ?? "";
    const buyerName = extractXmlValue(block, "user:display-name") ?? "";
    const buyerEmail = extractXmlValue(block, "user:email") ?? "";
    const lastMessage = extractXmlValue(block, "user:text-short-trimmed") ?? "";
    const unread = extractXmlValue(block, "user:unread") === "true";

    if (conversationId) {
      conversations.push({
        conversationId,
        adId,
        adTitle,
        buyerName,
        buyerEmail,
        lastMessage,
        unread,
      });
    }
  }

  return conversations;
}

/**
 * Build reply XML payload for Kijiji conversation.
 */
function buildReplyXml(params: {
  adId: string;
  replyName: string;
  replyEmail: string;
  message: string;
  conversationId?: string;
  direction?: "TO_BUYER" | "TO_OWNER";
}): string {
  const direction = params.direction ?? "TO_BUYER";
  const convIdXml = params.conversationId
    ? `<reply:conversation-id>${escapeXml(params.conversationId)}</reply:conversation-id>`
    : `<reply:structured-msg-id>1</reply:structured-msg-id>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<reply:reply-to-ad-conversation
    xmlns:types="http://www.ebayclassifiedsgroup.com/schema/types/v1"
    xmlns:cat="http://www.ebayclassifiedsgroup.com/schema/category/v1"
    xmlns:loc="http://www.ebayclassifiedsgroup.com/schema/location/v1"
    xmlns:ad="http://www.ebayclassifiedsgroup.com/schema/ad/v1"
    xmlns:attr="http://www.ebayclassifiedsgroup.com/schema/attribute/v1"
    xmlns:pic="http://www.ebayclassifiedsgroup.com/schema/picture/v1"
    xmlns:user="http://www.ebayclassifiedsgroup.com/schema/user/v1"
    xmlns:rate="http://www.ebayclassifiedsgroup.com/schema/rate/v1"
    xmlns:reply="http://www.ebayclassifiedsgroup.com/schema/reply/v1"
    locale="en-CA">
    <reply:ad-id>${escapeXml(params.adId)}</reply:ad-id>
    <reply:reply-username>${escapeXml(params.replyName)}</reply:reply-username>
    <reply:reply-phone />
    <reply:reply-email>${escapeXml(params.replyEmail)}</reply:reply-email>
    <reply:reply-message>${escapeXml(params.message)}</reply:reply-message>
    ${convIdXml}
    <reply:reply-direction>
      <types:value>${direction}</types:value>
    </reply:reply-direction>
</reply:reply-to-ad-conversation>`;
}

/**
 * Send a reply to a Kijiji conversation.
 */
export async function kijijiSendReply(
  session: KijijiSession,
  params: {
    adId: string;
    replyName: string;
    message: string;
    conversationId?: string;
  }
): Promise<boolean> {
  const url = `${MINGLE_BASE}/replies/reply-to-ad-conversation`;

  const xmlBody = buildReplyXml({
    adId: params.adId,
    replyName: params.replyName,
    replyEmail: session.email,
    message: params.message,
    conversationId: params.conversationId,
    direction: "TO_BUYER",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "content-type": "application/xml",
      "x-ecg-authorization-user": authHeader(session),
    },
    body: xmlBody,
  });

  if (res.status !== 201) {
    const text = await res.text();
    throw new Error(`Kijiji reply failed (${res.status}): ${text}`);
  }

  return true;
}

/**
 * Build Kijiji ad attributes for a vehicle listing.
 */
export function buildVehicleAttributes(vehicle: {
  year: number;
  make: string;
  model: string;
  mileage: number | null;
  transmission: string | null;
  fuel_type: string | null;
  drivetrain?: string | null;
  body_type?: string | null;
  colour?: string | null;
}): KijijiAdAttribute[] {
  const attrs: KijijiAdAttribute[] = [
    { name: "caryear", value: vehicle.year.toString() },
  ];

  if (vehicle.mileage) {
    attrs.push({
      name: "carmileageinkms",
      value: vehicle.mileage.toString(),
    });
  }
  if (vehicle.transmission) {
    attrs.push({
      name: "cartransmission",
      value: vehicle.transmission.toLowerCase() === "automatic" ? "2" : "1",
      localeValue: vehicle.transmission,
    });
  }
  if (vehicle.fuel_type) {
    const fuelMap: Record<string, string> = {
      gas: "1",
      diesel: "2",
      electric: "3",
      hybrid: "4",
      "flex fuel": "5",
    };
    attrs.push({
      name: "carfueltype",
      value: fuelMap[vehicle.fuel_type.toLowerCase()] ?? "1",
      localeValue: vehicle.fuel_type,
    });
  }
  if (vehicle.colour) {
    attrs.push({ name: "carcolor", value: vehicle.colour });
  }

  return attrs;
}
