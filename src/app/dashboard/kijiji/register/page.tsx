"use client";

import { useState, useCallback } from "react";

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

type AccountStatus = "pending" | "registering" | "success" | "error";

interface AccountResult {
  status: AccountStatus;
  error?: string;
}

export default function KijijiRegisterPage() {
  const [results, setResults] = useState<Record<string, AccountResult>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const registerDirect = useCallback(
    async (employee: { name: string; email: string }) => {
      setResults((prev) => ({
        ...prev,
        [employee.email]: { status: "registering" },
      }));
      addLog(`Registering ${employee.name} (${employee.email})...`);

      try {
        const resp = await fetch("https://www.kijiji.ca/anvil/api", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "apollo-require-preflight": "true",
          },
          body: JSON.stringify({
            operationName: "registerUser",
            variables: {
              input: {
                email: employee.email,
                password: PASSWORD,
                displayName: employee.name,
                businessName: "",
                redirectUrl: "",
                reCaptchaToken: "",
              },
            },
            query: `mutation registerUser($input: UserRegistrationInput!) {\n  userRegistration(input: $input)\n}\n`,
          }),
        });

        const data = await resp.json();

        if (data.errors && data.errors.length > 0) {
          const errorMsg = data.errors
            .map((e: { message: string }) => e.message)
            .join("; ");
          setResults((prev) => ({
            ...prev,
            [employee.email]: { status: "error", error: errorMsg },
          }));
          addLog(`Failed: ${employee.name} — ${errorMsg}`);
        } else {
          setResults((prev) => ({
            ...prev,
            [employee.email]: { status: "success" },
          }));
          addLog(`Registered: ${employee.name}`);
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown error";
        setResults((prev) => ({
          ...prev,
          [employee.email]: { status: "error", error: errorMsg },
        }));
        addLog(`Error: ${employee.name} — ${errorMsg}`);
      }
    },
    [addLog]
  );

  const registerAll = useCallback(async () => {
    setIsRunning(true);
    addLog("Starting bulk registration...");
    addLog(`Password for all accounts: ${PASSWORD}`);

    for (let i = currentIndex; i < EMPLOYEES.length; i++) {
      setCurrentIndex(i);
      await registerDirect(EMPLOYEES[i]);
      // Small delay between registrations
      await new Promise((r) => setTimeout(r, 2000));
    }

    setIsRunning(false);
    addLog("Bulk registration complete.");
  }, [currentIndex, registerDirect, addLog]);

  const successCount = Object.values(results).filter(
    (r) => r.status === "success"
  ).length;
  const errorCount = Object.values(results).filter(
    (r) => r.status === "error"
  ).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">
        Kijiji Account Registration
      </h1>
      <p className="text-gray-600 mb-6">
        Register Kijiji accounts for all 50 employees. Password:{" "}
        <code className="bg-gray-100 px-2 py-1 rounded font-mono text-sm">
          {PASSWORD}
        </code>
      </p>

      <div className="mb-6 flex gap-4 items-center">
        <button
          onClick={registerAll}
          disabled={isRunning}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {isRunning
            ? `Registering... (${currentIndex + 1}/${EMPLOYEES.length})`
            : "Register All Accounts"}
        </button>
        <span className="text-sm text-gray-600">
          {successCount} registered | {errorCount} failed |{" "}
          {EMPLOYEES.length - successCount - errorCount} pending
        </span>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
        <p className="text-yellow-800 text-sm font-medium">Important</p>
        <p className="text-yellow-700 text-sm mt-1">
          Kijiji uses reCAPTCHA to prevent automated registration. If
          registration fails from this page, use the browser console script
          at{" "}
          <code className="bg-yellow-100 px-1 rounded">
            scripts/kijiji-register-accounts.js
          </code>{" "}
          directly on kijiji.ca/register/personal — that approach works
          because the reCAPTCHA runs in the context of kijiji.ca.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Accounts</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {EMPLOYEES.map((emp, i) => {
                  const result = results[emp.email];
                  return (
                    <tr
                      key={emp.email}
                      className={
                        result?.status === "success"
                          ? "bg-green-50"
                          : result?.status === "error"
                          ? "bg-red-50"
                          : result?.status === "registering"
                          ? "bg-blue-50"
                          : ""
                      }
                    >
                      <td className="px-3 py-1.5 text-gray-500">
                        {i + 1}
                      </td>
                      <td className="px-3 py-1.5">{emp.name}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {emp.email}
                      </td>
                      <td className="px-3 py-1.5">
                        {result?.status === "success" && (
                          <span className="text-green-700">Registered</span>
                        )}
                        {result?.status === "error" && (
                          <span
                            className="text-red-700"
                            title={result.error}
                          >
                            Failed
                          </span>
                        )}
                        {result?.status === "registering" && (
                          <span className="text-blue-700">
                            Registering...
                          </span>
                        )}
                        {!result && (
                          <span className="text-gray-400">Pending</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Log</h2>
          <div className="border rounded-lg p-3 bg-gray-900 text-green-400 font-mono text-xs h-[600px] overflow-y-auto">
            {log.length === 0 ? (
              <p className="text-gray-500">
                Click &quot;Register All Accounts&quot; to start...
              </p>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="mb-1">
                  {entry}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
