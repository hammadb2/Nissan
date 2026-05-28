/**
 * Kijiji Account Registration Helper
 * 
 * Run this script in your browser console while on https://www.kijiji.ca/register/personal
 * It will automatically fill in the registration form for each employee and submit it.
 * 
 * USAGE:
 * 1. Open https://www.kijiji.ca/register/personal in your browser
 * 2. Open browser DevTools (F12) -> Console tab
 * 3. Paste this entire script and press Enter
 * 4. Follow the prompts — it will fill each form and you just need to click Submit
 * 
 * After each registration, you may need to verify the email.
 * The script will prompt you to move to the next employee.
 */

const EMPLOYEES = [
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
];

const PASSWORD = "SouthTrail2025!Nw";

function setNativeValue(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value"
  ).set;
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillForm(employee) {
  const nameInput = document.querySelector('input[type="text"]');
  const emailInput = document.querySelector('input[type="email"]');
  const passwordInputs = document.querySelectorAll('input[type="password"]');

  if (!nameInput || !emailInput || passwordInputs.length < 2) {
    console.error("Could not find form fields. Make sure you are on the registration page.");
    return false;
  }

  setNativeValue(nameInput, employee.name);
  setNativeValue(emailInput, employee.email);
  setNativeValue(passwordInputs[0], PASSWORD);
  setNativeValue(passwordInputs[1], PASSWORD);

  // Click checkboxes
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    const text = label.textContent || "";
    if (text.includes("Terms of Use") || text.includes("Privacy Policy")) {
      const checkbox = label.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) {
        label.click();
      }
    }
  }

  console.log(`Form filled for: ${employee.name} (${employee.email})`);
  console.log(`Password: ${PASSWORD}`);
  return true;
}

let currentIndex = 0;

window.kijijiNext = async function() {
  if (currentIndex >= EMPLOYEES.length) {
    console.log("All employees done!");
    return;
  }

  if (window.location.pathname !== "/register/personal") {
    window.location.href = "https://www.kijiji.ca/register/personal";
    console.log("Navigating to registration page. Run kijijiNext() again after page loads.");
    return;
  }

  const emp = EMPLOYEES[currentIndex];
  console.log(`\n=== Employee ${currentIndex + 1}/${EMPLOYEES.length} ===`);
  const success = await fillForm(emp);
  if (success) {
    console.log("Form filled! Click 'Sign Up' to submit.");
    console.log("After registration, run kijijiNext() for the next employee.");
    currentIndex++;
  }
};

window.kijijiSkipTo = function(index) {
  currentIndex = index;
  console.log(`Skipped to employee ${index + 1}: ${EMPLOYEES[index].name}`);
};

console.log(`
╔══════════════════════════════════════════════╗
║   Kijiji Account Registration Helper        ║
║   50 employees ready to register            ║
║   Password for all: ${PASSWORD}       ║
╠══════════════════════════════════════════════╣
║   Commands:                                 ║
║   kijijiNext()     - Fill next employee     ║
║   kijijiSkipTo(n)  - Skip to employee #n    ║
╚══════════════════════════════════════════════╝
`);

// Auto-fill first employee
kijijiNext();
