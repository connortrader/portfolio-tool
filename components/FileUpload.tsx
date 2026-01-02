import React, { useRef } from 'react';
import { Upload, FileSpreadsheet, Plus, X } from 'lucide-react';
import Papa from 'papaparse';
import { normalizeDate, parseNumber } from '../services/financeService';

interface FileUploadProps {
  onDataLoaded: (name: string, data: Map<string, number>) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
      // Reset input so same file can be selected again if needed
      e.target.value = ''; 
    }
  };

  const processFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: false, // Disable to handle parsing manually
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, any>[];
        const dataMap = new Map<string, number>();
        
        // Auto-detect columns
        if (rows.length > 0) {
          const keys = Object.keys(rows[0]);
          // Robust detection with trimming and lowercasing
          const dateKeyOrig = keys.find(k => k.trim().toLowerCase().includes('date'));
          const equityKeyOrig = keys.find(k => {
            const l = k.trim().toLowerCase();
            return l.includes('equity') || l.includes('nav') || l.includes('close') || l.includes('balance');
          });

          if (dateKeyOrig && equityKeyOrig) {
            let validRows = 0;
            rows.forEach(row => {
              const d = normalizeDate(row[dateKeyOrig]);
              const val = parseNumber(row[equityKeyOrig]);
              if (d && !isNaN(val)) {
                dataMap.set(d, val);
                validRows++;
              }
            });
            
            if (validRows > 0) {
                const name = file.name.replace(/\.[^/.]+$/, "");
                onDataLoaded(name, dataMap);
            } else {
                alert(`Parsed 0 valid rows from ${file.name}. Check date format (YYYY-MM-DD or MM/DD/YYYY) and equity values.`);
            }
          } else {
             alert(`Could not auto-detect 'Date' and 'Equity' columns in ${file.name}. Detected columns: ${keys.join(', ')}`);
          }
        }
      },
      error: (err) => {
        console.error("CSV Error", err);
        alert("Error parsing CSV file.");
      }
    });
  };

  return (
    <div className="mb-6">
      <div 
        className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={inputRef} 
          className="hidden" 
          accept=".csv"
          onChange={handleFileChange}
        />
        <div className="flex flex-col items-center gap-2 text-slate-600">
          <div className="bg-blue-50 p-3 rounded-full text-blue-600 mb-1">
            <Upload size={24} />
          </div>
          <span className="font-medium text-sm">Click to upload CSV Strategy</span>
          <span className="text-xs text-slate-400">Format: Date column, Equity column</span>
        </div>
      </div>
    </div>
  );
};