import React, { useState, FormEvent, useRef } from 'react';
import MainLayout from '../components/MainLayout';
import '../assets/WktToKml.css';
import * as XLSX from 'xlsx';

// ============================================================
// Kontrak field ini HARUS selaras dengan endpoint /api/wkt-to-kml di server.ts:
// csv_file, geometry_mode ('wkt' | 'latlon'), wkt_column, lat_column, lon_column,
// name_column, description_columns (JSON string array).
// Server sudah auto-detect kolom via alias (wkt/geometry, lat/latitude, dst) jika
// field-field kolom di atas tidak dikirim -- tapi di sini kita tetap kirim eksplisit
// begitu user pilih, supaya hasilnya sesuai kolom yang benar-benar dipilih user.
// ============================================================

type AlertState = { type: 'success' | 'error'; text: string } | null;
type GeometryMode = 'wkt' | 'latlon';

// Deteksi delimiter CSV sederhana dari baris pertama (koma/titik-koma/tab/pipe)
function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = line.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  
  return best;
}
function isExcelFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ext === 'xlsx' || ext === 'xls';
}

// Parser baris header yang menangani kolom berkutip ("Nama Kolom")
function parseHeaderLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result.map((h) => h.replace(/^"|"$/g, '')).filter((h) => h.length > 0);
}

// Tebak kolom yang paling cocok berdasarkan kata kunci umum
function guessColumn(headers: string[], keywords: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return '';
}

const WktToKml: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [geometryMode, setGeometryMode] = useState<GeometryMode>('wkt');
  const [wktColumn, setWktColumn] = useState('');
  const [latColumn, setLatColumn] = useState('');
  const [lonColumn, setLonColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [descriptionColumns, setDescriptionColumns] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

const readHeaders = (f: File) => {
  if (isExcelFile(f.name)) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const firstRow = rows.find((r) => r.some((c) => String(c).trim().length > 0));
        if (!firstRow) return;

        const hdrs = firstRow.map((h) => String(h).trim()).filter((h) => h.length > 0);

        setHeaders(hdrs);
        setWktColumn(guessColumn(hdrs, ['wkt', 'geometry', 'geom', 'shape']));
        setLatColumn(guessColumn(hdrs, ['latitude', 'lat', 'lintang']));
        setLonColumn(guessColumn(hdrs, ['longitude', 'lon', 'bujur']));
        setNameColumn(guessColumn(hdrs, ['name', 'nama', 'title', 'id']));
        setDescriptionColumns([]);
      } catch (err) {
        console.error('Gagal membaca file Excel:', err);
        setAlert({ type: 'error', text: 'Gagal membaca file Excel. Pastikan formatnya .xlsx atau .xls yang valid.' });
      }
    };
    // File Excel adalah ZIP biner -- harus dibaca sebagai ArrayBuffer, bukan text
    reader.readAsArrayBuffer(f);
    return;
  }

  // Alur CSV (tidak berubah)
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
    if (!firstLine) return;

    const delimiter = detectDelimiter(firstLine);
    const hdrs = parseHeaderLine(firstLine, delimiter);

    setHeaders(hdrs);
    setWktColumn(guessColumn(hdrs, ['wkt', 'geometry', 'geom', 'shape']));
    setLatColumn(guessColumn(hdrs, ['latitude', 'lat', 'lintang']));
    setLonColumn(guessColumn(hdrs, ['longitude', 'lon', 'bujur']));
    setNameColumn(guessColumn(hdrs, ['name', 'nama', 'title', 'id']));
    setDescriptionColumns([]);
  };
  reader.readAsText(f.slice(0, 65536));
};

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setHeaders([]);
    setWktColumn('');
    setLatColumn('');
    setLonColumn('');
    setNameColumn('');
    setDescriptionColumns([]);
    if (f) readHeaders(f);
  };

  const toggleDescriptionColumn = (col: string) => {
    setDescriptionColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const resetForm = () => {
    setFile(null);
    setHeaders([]);
    setGeometryMode('wkt');
    setWktColumn('');
    setLatColumn('');
    setLonColumn('');
    setNameColumn('');
    setDescriptionColumns([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!file) {
      setAlert({ type: 'error', text: 'Mohon pilih file CSV terlebih dahulu.' });
      return;
    }
    if (!nameColumn) {
      setAlert({ type: 'error', text: 'Kolom Nama wajib dipilih.' });
      return;
    }
    if (geometryMode === 'wkt' && !wktColumn) {
      setAlert({ type: 'error', text: 'Kolom WKT wajib dipilih untuk mode ini.' });
      return;
    }
    if (geometryMode === 'latlon' && (!latColumn || !lonColumn)) {
      setAlert({ type: 'error', text: 'Kolom Latitude dan Longitude wajib dipilih untuk mode ini.' });
      return;
    }

    setIsLoading(true);
    setAlert(null);

    // Nama field HARUS sama dengan yang dibaca server.ts di endpoint /api/wkt-to-kml
    const formData = new FormData();
    formData.append('csv_file', file);
    formData.append('geometry_mode', geometryMode);
    if (wktColumn) formData.append('wkt_column', wktColumn);
    if (latColumn) formData.append('lat_column', latColumn);
    if (lonColumn) formData.append('lon_column', lonColumn);
    formData.append('name_column', nameColumn);
    formData.append('description_columns', JSON.stringify(descriptionColumns));

    try {
      const response = await fetch('/api/wkt-to-kml', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMsg = 'Terjadi kesalahan server.';
        try {
          const errData = await response.json();
          errMsg = errData.message || errMsg;
        } catch {
          /* respons bukan JSON, pakai pesan default */
        }
        throw new Error(errMsg);
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'converted_data.kml';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setAlert({ type: 'success', text: 'File KML berhasil dihasilkan dan sedang diunduh!' });
      resetForm();
    } catch (error: any) {
      console.error('Error:', error);
      setAlert({ type: 'error', text: error.message || 'Gagal memproses data.' });
    } finally {
      setIsLoading(false);
    }
  };

  const usedColumns = [wktColumn, latColumn, lonColumn, nameColumn];

  return (
    <MainLayout pageTitle="WKT to KML" activeMenu="wkt-to-kml">
      <div className="wkt-wrapper">
        <form onSubmit={handleSubmit} className="wkt-form-container">
          {/* ================= UPLOAD CSV ================= */}
          <div className="wkt-form-group">
            <label className="wkt-form-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg>
              File CSV <span>*</span>
            </label>
            <div
              className={`wkt-upload-zone ${file ? 'has-file' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileChange(f);
              }}
            >
              <div className="wkt-upload-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <div className="wkt-upload-title">
                {file ? file.name : 'Klik untuk memilih file atau drag & drop di sini'}
              </div>
              <div className="wkt-upload-subtitle">
                {file ? 'Siap diproses' : 'Belum ada file dipilih'}
              </div>
            </div>
            <span className="wkt-help-text">
              Format: CSV atau Excel (.xlsx/.xls). Kolom WKT/Geometry, Latitude/Longitude, dan Nama akan ditebak otomatis
  begitu file dipilih -- kamu tetap bisa mengganti pilihannya di bawah.
            </span>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv, .xls, .xlsx"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
            />
          </div>

          {/* ================= PEMILIHAN KOLOM (muncul setelah file dipilih) ================= */}
          {headers.length > 0 && (
            <>
              <div className="wkt-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
                Sumber Geometri
              </div>
              <div className="wkt-radio-group">
                <label className={`wkt-radio-option ${geometryMode === 'wkt' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="geometry_mode"
                    checked={geometryMode === 'wkt'}
                    onChange={() => setGeometryMode('wkt')}
                  />
                  Kolom WKT (Well-Known Text)
                </label>
                <label className={`wkt-radio-option ${geometryMode === 'latlon' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="geometry_mode"
                    checked={geometryMode === 'latlon'}
                    onChange={() => setGeometryMode('latlon')}
                  />
                  Kolom Latitude / Longitude
                </label>
              </div>

              <div className="wkt-input-row">
                {geometryMode === 'wkt' ? (
                  <div className="wkt-form-col">
                    <label className="wkt-form-label">Kolom WKT <span>*</span></label>
                    <select className="wkt-input-text" value={wktColumn} onChange={(e) => setWktColumn(e.target.value)}>
                      <option value="">-- Pilih Kolom WKT --</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="wkt-form-col">
                      <label className="wkt-form-label">Kolom Latitude <span>*</span></label>
                      <select className="wkt-input-text" value={latColumn} onChange={(e) => setLatColumn(e.target.value)}>
                        <option value="">-- Pilih Kolom Latitude --</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div className="wkt-form-col">
                      <label className="wkt-form-label">Kolom Longitude <span>*</span></label>
                      <select className="wkt-input-text" value={lonColumn} onChange={(e) => setLonColumn(e.target.value)}>
                        <option value="">-- Pilih Kolom Longitude --</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <div className="wkt-form-col">
                  <label className="wkt-form-label">Kolom Nama (Label) <span>*</span></label>
                  <select className="wkt-input-text" value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}>
                    <option value="">-- Pilih Kolom Nama --</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div className="wkt-form-group">
                <label className="wkt-form-label">Kolom Deskripsi (Opsional)</label>
                <div className="wkt-checkbox-group">
                  {headers
                    .filter((h) => !usedColumns.includes(h))
                    .map((h) => (
                      <label key={h} className="wkt-checkbox-item">
                        <input
                          type="checkbox"
                          checked={descriptionColumns.includes(h)}
                          onChange={() => toggleDescriptionColumn(h)}
                        />
                        {h}
                      </label>
                    ))}
                  {headers.filter((h) => !usedColumns.includes(h)).length === 0 && (
                    <span className="wkt-help-text">Tidak ada kolom lain yang bisa dijadikan deskripsi.</span>
                  )}
                </div>
              </div>
            </>
          )}

          <button type="submit" disabled={isLoading || !file} className="wkt-btn-submit">
            {isLoading ? (
              <span className="wkt-btn-loading">
                <span className="wkt-spinner" /> MEMPROSES...
              </span>
            ) : 'KONVERSI KE KML'}
          </button>
        </form>

        {alert && (
          <div className={`wkt-alert wkt-alert-${alert.type}`}>
            {alert.text}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default WktToKml;