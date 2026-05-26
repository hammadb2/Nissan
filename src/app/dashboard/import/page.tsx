"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";

interface ImportResult {
  imported: number;
  duplicates: number;
  errors: number;
  total: number;
  batch: string;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (batchName) formData.append("batch", batchName);

    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error ?? "Import failed");
        return;
      }

      const data = await res.json();
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setError("Import failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Import Call List</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileSpreadsheet size={20} className="text-blue-600" />
          <h2 className="font-semibold">Upload Excel or CSV</h2>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm text-gray-600">
          <p className="font-medium mb-2">Expected columns:</p>
          <code className="text-xs bg-gray-200 px-2 py-1 rounded">
            First Name, Last Name, Phone, Email (optional), Year, Make, Model
          </code>
          <ul className="mt-2 space-y-1 text-xs">
            <li>Phone numbers will be normalized to E.164 format (+14031234567)</li>
            <li>Duplicates by phone number will be updated, not duplicated</li>
            <li>Import runs in batches of 100</li>
          </ul>
        </div>

        <form onSubmit={handleImport} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File (.xlsx or .csv)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch Name (optional)
            </label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder={`e.g., ${new Date().toISOString().split("T")[0]}`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || uploading}
            className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Importing...
              </>
            ) : (
              <>
                <Upload size={16} />
                Import Contacts
              </>
            )}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-green-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={20} className="text-green-600" />
            <h3 className="font-semibold text-green-800">Import Complete</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Total Rows</p>
              <p className="text-lg font-bold">{result.total}</p>
            </div>
            <div>
              <p className="text-gray-500">Imported</p>
              <p className="text-lg font-bold text-green-600">{result.imported}</p>
            </div>
            <div>
              <p className="text-gray-500">Duplicates Updated</p>
              <p className="text-lg font-bold text-amber-600">{result.duplicates}</p>
            </div>
            <div>
              <p className="text-gray-500">Errors</p>
              <p className="text-lg font-bold text-red-600">{result.errors}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">Batch: {result.batch}</p>
        </div>
      )}
    </div>
  );
}
