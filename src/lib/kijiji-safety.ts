/**
 * Kijiji safety utilities to prevent account bans.
 *
 * Key rules enforced:
 * - Unique descriptions per listing (no copy-paste detection)
 * - Rate-limited posting with random delays
 * - Canadian IP verification before posting
 * - Shadow ban visibility checks
 * - One vehicle = one listing (enforced at DB level via unique constraint)
 */

const OPENING_PHRASES = [
  "Check out this",
  "Don't miss this",
  "Now available:",
  "Just listed!",
  "Available now —",
  "Looking for a reliable ride?",
  "Great find!",
  "This one won't last —",
  "Freshly listed:",
  "Here's a great option —",
];

const CLOSING_PHRASES = [
  "Contact us through Kijiji messaging or call/text 587-328-1721.",
  "Send us a message on Kijiji or call 587-328-1721 to learn more.",
  "Reach out through Kijiji messaging or call 587-328-1721 to schedule a viewing.",
  "Message us here on Kijiji or text 587-328-1721 for additional information.",
  "Interested? Send a message through Kijiji or call 587-328-1721.",
  "Drop us a message on Kijiji or call/text 587-328-1721 to set up a time to see it.",
  "Send a Kijiji message or call 587-328-1721 — we'll get back to you quickly.",
  "Feel free to message us on Kijiji or text 587-328-1721 with any questions.",
  "Get in touch through Kijiji messaging or call 587-328-1721 — we respond fast.",
  "Have questions? Message us right here on Kijiji or call 587-328-1721.",
];

const LOCATION_PHRASES = [
  "Located in SE Calgary, Alberta.",
  "Come see it in South East Calgary, AB.",
  "Available for viewing in Calgary SE.",
  "Located at our SE Calgary location.",
  "Visit us in the SE part of Calgary.",
];

const FINANCING_SAFE_PHRASES = [
  "Financing options may be available — ask us for details.",
  "Trade-ins are welcome.",
  "We're happy to discuss trade-in options.",
  "Ask about our trade-in program.",
  "",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface VehicleInfo {
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_trim: string | null;
  mileage: number | null;
  price: number | null;
  transmission: string | null;
  drivetrain: string | null;
  fuel_type: string | null;
  engine: string | null;
  exterior_colour: string | null;
  interior_colour: string | null;
  doors: number | null;
  seats: number | null;
  body_type: string | null;
  features: string | null;
  vin: string | null;
}

/**
 * Generates a unique Kijiji description for a vehicle.
 * Each call produces a different variation to avoid
 * copy-paste detection that triggers Kijiji bans.
 */
export function generateUniqueDescription(vehicle: VehicleInfo): string {
  const lines: string[] = [];
  const name = `${vehicle.vehicle_year} ${vehicle.vehicle_make} ${vehicle.vehicle_model}${vehicle.vehicle_trim ? " " + vehicle.vehicle_trim : ""}`;

  lines.push(`${pick(OPENING_PHRASES)} ${name}`);
  lines.push("");

  const specs: string[] = [];
  if (vehicle.mileage != null) {
    specs.push(`Mileage: ${vehicle.mileage.toLocaleString("en-CA")} km`);
  }
  if (vehicle.transmission) specs.push(`Transmission: ${vehicle.transmission}`);
  if (vehicle.drivetrain) specs.push(`Drivetrain: ${vehicle.drivetrain}`);
  if (vehicle.fuel_type) specs.push(`Fuel: ${vehicle.fuel_type}`);
  if (vehicle.engine) specs.push(`Engine: ${vehicle.engine}`);
  if (vehicle.body_type) specs.push(`Body: ${vehicle.body_type}`);
  if (vehicle.exterior_colour) specs.push(`Exterior: ${vehicle.exterior_colour}`);
  if (vehicle.interior_colour) specs.push(`Interior: ${vehicle.interior_colour}`);
  if (vehicle.doors) specs.push(`Doors: ${vehicle.doors}`);
  if (vehicle.seats) specs.push(`Seats: ${vehicle.seats}`);

  const shuffledSpecs = shuffle(specs);

  if (Math.random() > 0.5) {
    lines.push("VEHICLE DETAILS:");
  } else {
    lines.push("SPECIFICATIONS:");
  }

  for (const spec of shuffledSpecs) {
    const bullet = Math.random() > 0.5 ? "•" : "-";
    lines.push(`${bullet} ${spec}`);
  }
  lines.push("");

  if (vehicle.features) {
    const featureList = vehicle.features.split(",").map((f) => f.trim()).filter((f) => f.length > 2);
    if (featureList.length > 0) {
      const shuffledFeatures = shuffle(featureList);
      const count = Math.min(shuffledFeatures.length, 8 + Math.floor(Math.random() * 5));

      if (Math.random() > 0.5) {
        lines.push("KEY FEATURES:");
      } else {
        lines.push("HIGHLIGHTS:");
      }

      for (let i = 0; i < count; i++) {
        const bullet = Math.random() > 0.5 ? "•" : "-";
        lines.push(`${bullet} ${shuffledFeatures[i]}`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(pick(LOCATION_PHRASES));

  const finance = pick(FINANCING_SAFE_PHRASES);
  if (finance) lines.push(finance);

  lines.push("");
  lines.push(pick(CLOSING_PHRASES));

  return lines.join("\n");
}

/**
 * Returns a random delay in ms between postings.
 * Min 45 seconds, max 3 minutes.
 */
export function getPostingDelay(): number {
  return 45000 + Math.floor(Math.random() * 135000);
}

/**
 * Checks if the current server has a Canadian IP.
 * Uses a free geo-IP API. Returns the country code.
 */
export async function checkServerLocation(): Promise<{
  isCanadian: boolean;
  country: string;
  ip: string;
}> {
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return {
      isCanadian: data.country_code === "CA",
      country: data.country_code ?? "unknown",
      ip: data.ip ?? "unknown",
    };
  } catch {
    return { isCanadian: false, country: "error", ip: "unknown" };
  }
}

/**
 * Sleep utility for posting delays.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
