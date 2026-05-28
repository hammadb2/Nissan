import type { AutoTraderVehicle } from "./types";

const DEALER_ID = "47942906";
const BASE_URL = `https://www.autotrader.ca/dealers/${DEALER_ID}`;

interface ScrapeOptions {
  offer?: "U" | "N";
  pageSize?: number;
}

function parseVehicleBlock(block: string): AutoTraderVehicle | null {
  const titleMatch = block.match(
    /^##\s*(\d{4})\s+([A-Za-z-]+(?:\s[A-Za-z-]+)?)\s+([A-Za-z0-9-]+(?:\s[A-Za-z0-9-]+)?)(.*?)$/m
  );
  if (!titleMatch) return null;

  const year = parseInt(titleMatch[1], 10);
  const make = titleMatch[2].trim();
  const modelAndTrim = (titleMatch[3] + (titleMatch[4] || "")).trim();

  const parts = modelAndTrim.split(/\s+/);
  const model = parts[0] || "";
  const trim = parts.slice(1).join(" ");

  const fullTitle = `${year} ${make} ${model}${trim ? " " + trim : ""}`;

  const priceMatch = block.match(/\$\s*([\d,]+)/);
  const price = priceMatch
    ? parseFloat(priceMatch[1].replace(/,/g, ""))
    : null;

  const mileageMatch = block.match(/([\d,]+)\s*km/i);
  const mileage = mileageMatch
    ? parseInt(mileageMatch[1].replace(/,/g, ""), 10)
    : null;

  const transmissionMatch = block.match(
    /(?:Automatic|Manual|CVT)/i
  );
  const transmission = transmissionMatch
    ? transmissionMatch[0]
    : null;

  const fuelMatch = block.match(
    /(?:Gas|Diesel|Electric|Hybrid|Flex Fuel|Plug-in Hybrid)/i
  );
  const fuel_type = fuelMatch ? fuelMatch[0] : null;

  const descMatch = block.match(
    /\d{4}\s+[A-Z][\s\S]*?(?=South Trail Nissan|$)/
  );
  const description = descMatch ? descMatch[0].trim() : "";

  const featureMatches = description.match(/-\s*([^-\n]+)/g);
  const features = featureMatches
    ? featureMatches
        .map((f) => f.replace(/^-\s*/, "").trim())
        .filter(
          (f) =>
            f.length > 3 &&
            !f.startsWith("CALL OR TEXT") &&
            !f.startsWith("Whether") &&
            !f.startsWith("AMVIC")
        )
    : [];

  return {
    title: fullTitle,
    year,
    make,
    model,
    trim,
    price,
    mileage,
    transmission,
    fuel_type,
    description,
    features,
  };
}

export async function scrapeAutoTraderInventory(
  options: ScrapeOptions = {}
): Promise<AutoTraderVehicle[]> {
  const { offer = "U", pageSize = 100 } = options;

  const url = `${BASE_URL}?offer=${offer}&size=${pageSize}&sort=standard&damaged_listing=exclude`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(
      `AutoTrader fetch failed: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const vehicles: AutoTraderVehicle[] = [];

  const vehicleBlocks = html.split(/(?=## \d{4}\s)/);

  for (const block of vehicleBlocks) {
    const vehicle = parseVehicleBlock(block);
    if (vehicle) {
      vehicles.push(vehicle);
    }
  }

  return vehicles;
}

export function generateKijijiTitle(vehicle: AutoTraderVehicle): string {
  const parts = [
    vehicle.year.toString(),
    vehicle.make,
    vehicle.model,
  ];
  if (vehicle.trim) parts.push(vehicle.trim);
  if (vehicle.mileage) {
    parts.push(`- ${(vehicle.mileage / 1000).toFixed(0)}k km`);
  }
  return parts.join(" ");
}

export function generateKijijiDescription(
  vehicle: AutoTraderVehicle
): string {
  const lines: string[] = [];

  lines.push(
    `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`
  );
  lines.push("");

  if (vehicle.price) {
    lines.push(
      `Price: $${vehicle.price.toLocaleString("en-CA")}`
    );
  }
  if (vehicle.mileage) {
    lines.push(
      `Mileage: ${vehicle.mileage.toLocaleString("en-CA")} km`
    );
  }
  if (vehicle.transmission) {
    lines.push(`Transmission: ${vehicle.transmission}`);
  }
  if (vehicle.fuel_type) {
    lines.push(`Fuel Type: ${vehicle.fuel_type}`);
  }
  lines.push("");

  if (vehicle.features.length > 0) {
    lines.push("KEY FEATURES:");
    for (const feature of vehicle.features.slice(0, 15)) {
      lines.push(`• ${feature}`);
    }
    if (vehicle.features.length > 15) {
      lines.push("• And many more!");
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "Call or text for more information or to book a test drive."
  );
  lines.push("Located in Calgary, AB (South East)");
  lines.push("");
  lines.push("Financing available. Trade-ins welcome.");

  return lines.join("\n");
}

export const EMPLOYEE_LIST = [
  { name: "James Mitchell", email: "james.mitchell@newwheels.ca" },
  { name: "Sarah Thompson", email: "sarah.thompson@newwheels.ca" },
  { name: "Michael Chen", email: "michael.chen@newwheels.ca" },
  { name: "Emma Rodriguez", email: "emma.rodriguez@newwheels.ca" },
  { name: "David Kim", email: "david.kim@newwheels.ca" },
  { name: "Ashley Williams", email: "ashley.williams@newwheels.ca" },
  { name: "Ryan Patel", email: "ryan.patel@newwheels.ca" },
  { name: "Jessica Nguyen", email: "jessica.nguyen@newwheels.ca" },
  { name: "Tyler Morrison", email: "tyler.morrison@newwheels.ca" },
  { name: "Amanda Clarke", email: "amanda.clarke@newwheels.ca" },
  { name: "Brandon Lee", email: "brandon.lee@newwheels.ca" },
  { name: "Stephanie Brown", email: "stephanie.brown@newwheels.ca" },
  { name: "Kevin Murphy", email: "kevin.murphy@newwheels.ca" },
  { name: "Lauren Singh", email: "lauren.singh@newwheels.ca" },
  { name: "Justin Pearce", email: "justin.pearce@newwheels.ca" },
  { name: "Nicole Foster", email: "nicole.foster@newwheels.ca" },
  { name: "Daniel Walsh", email: "daniel.walsh@newwheels.ca" },
  { name: "Rachel Malik", email: "rachel.malik@newwheels.ca" },
  { name: "Andrew Hoffman", email: "andrew.hoffman@newwheels.ca" },
  { name: "Megan Stewart", email: "megan.stewart@newwheels.ca" },
  { name: "Christopher Young", email: "christopher.young@newwheels.ca" },
  { name: "Brittany Hall", email: "brittany.hall@newwheels.ca" },
  { name: "Matthew Turner", email: "matthew.turner@newwheels.ca" },
  { name: "Samantha Price", email: "samantha.price@newwheels.ca" },
  { name: "Jordan Baker", email: "jordan.baker@newwheels.ca" },
  { name: "Kayla Bennett", email: "kayla.bennett@newwheels.ca" },
  { name: "Nathan Cooper", email: "nathan.cooper@newwheels.ca" },
  { name: "Tiffany Reid", email: "tiffany.reid@newwheels.ca" },
  { name: "Kyle Patterson", email: "kyle.patterson@newwheels.ca" },
  { name: "Danielle Morgan", email: "danielle.morgan@newwheels.ca" },
  { name: "Austin Hughes", email: "austin.hughes@newwheels.ca" },
  { name: "Vanessa Gray", email: "vanessa.gray@newwheels.ca" },
  { name: "Zachary Bell", email: "zachary.bell@newwheels.ca" },
  { name: "Amber Cox", email: "amber.cox@newwheels.ca" },
  { name: "Trevor James", email: "trevor.james@newwheels.ca" },
  { name: "Melissa Ward", email: "melissa.ward@newwheels.ca" },
  { name: "Cody Collins", email: "cody.collins@newwheels.ca" },
  { name: "Heather Rivera", email: "heather.rivera@newwheels.ca" },
  { name: "Logan Peterson", email: "logan.peterson@newwheels.ca" },
  { name: "Crystal Howard", email: "crystal.howard@newwheels.ca" },
  { name: "Derek Sanders", email: "derek.sanders@newwheels.ca" },
  { name: "Tara Powell", email: "tara.powell@newwheels.ca" },
  { name: "Spencer Long", email: "spencer.long@newwheels.ca" },
  { name: "Monica Russell", email: "monica.russell@newwheels.ca" },
  { name: "Garrett Butler", email: "garrett.butler@newwheels.ca" },
  { name: "Paige Simmons", email: "paige.simmons@newwheels.ca" },
  { name: "Chad Jenkins", email: "chad.jenkins@newwheels.ca" },
  { name: "Natasha Perry", email: "natasha.perry@newwheels.ca" },
  { name: "Blake Fleming", email: "blake.fleming@newwheels.ca" },
  { name: "Cassandra Ross", email: "cassandra.ross@newwheels.ca" },
] as const;
