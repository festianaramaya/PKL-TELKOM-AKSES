import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import MainLayout from '../components/MainLayout';
import '../assets/Csvtokmlconverter.css';

// ============================================================
// Ikon penanda
// ============================================================
const ICON_OPTIONS: { id: string; url: string }[] = [
  { id: 'U', url: 'https://maps.google.com/mapfiles/kml/paddle/U.png' },
  { id: 'L', url: 'https://maps.google.com/mapfiles/kml/paddle/L.png' },
  { id: 'Yellow Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/ylw-circle.png' },
  { id: 'Red Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/red-circle.png' },
  { id: 'Blue Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/blu-circle.png' },
  { id: 'Green Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/grn-circle.png' },
  { id: 'Pink Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/pink-circle.png' },
  { id: 'White Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/wht-circle.png' },
  { id: 'Circle Dot', url: 'https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png' },
  { id: 'Flag', url: 'https://maps.google.com/mapfiles/kml/shapes/flag.png' },
  { id: 'Home', url: 'https://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png' },
];
const DEFAULT_ICON_URL = 'http://maps.google.com/mapfiles/kml/paddle/wht-blank.png';

type IconConfig = { iconUrl: string; color: string; iconScale: number; labelScale: number };
type Mapping = { lat: string; lng: string; title: string; status: string; description: string[] };
type AlertState = { type: 'success' | 'error'; text: string } | null;

// ============================================================
// Parser CSV ringan (client-side)
// ============================================================
function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function parseCsvText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function autoColorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  const h = hue / 360;
  const s = 0.55;
  const l = 0.5;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function defaultIconConfig(color: string): IconConfig {
  return { iconUrl: DEFAULT_ICON_URL, color, iconScale: 1.0, labelScale: 0.8 };
}

function groupPreview(rows: Record<string, string>[], levels: string[]): any {
  if (levels.length === 0) return rows;
  const [field, ...rest] = levels;
  const grouped: Record<string, Record<string, string>[]> = {};
  rows.forEach((r) => {
    const key = r[field] || 'UNKNOWN';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });
  const result: Record<string, any> = {};
  Object.entries(grouped).forEach(([k, v]) => {
    result[k] = groupPreview(v, rest);
  });
  return result;
}

function TreePreview({ node, depth = 0 }: { node: any; depth?: number }) {
  if (Array.isArray(node)) {
    return <span className="tree-count">{node.length} data</span>;
  }
  return (
    <ul className="tree-list" style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      {Object.entries(node).map(([key, value]) => (
        <li key={key}>
          <span className="tree-folder-icon">📁</span> {key}{' '}
          {Array.isArray(value) ? (
            <span className="tree-count">({(value as any[]).length} data)</span>
          ) : null}
          {!Array.isArray(value) && <TreePreview node={value} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

const CsvToKmlConverter: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  const [mapping, setMapping] = useState<Mapping>({ lat: '', lng: '', title: '', status: '', description: [] });
  const [folderLevels, setFolderLevels] = useState<string[]>([]);
  const [checkedStatuses, setCheckedStatuses] = useState<Record<string, boolean>>({});
  const [iconMapping, setIconMapping] = useState<Record<string, IconConfig>>({});

  const [filename, setFilename] = useState('output');
  const [format, setFormat] = useState<'kml' | 'kmz'>('kml');

  const statusValues = useMemo(() => {
    if (!mapping.status) return [];
    const set = new Set<string>();
    allRows.forEach((r) => set.add(r[mapping.status] || 'UNKNOWN'));
    return Array.from(set).sort();
  }, [allRows, mapping.status]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';

    if (!['csv', 'txt', 'xlsx', 'xls'].includes(fileExt)) {
      setAlert({ type: 'error', text: 'Mohon unggah file dengan format .csv, .txt, atau Excel (.xlsx/.xls)' });
      e.target.value = '';
      return;
    }

    const applyParsedData = (hdrs: string[], dataRows: Record<string, string>[]) => {
      if (dataRows.length < 1) {
        setAlert({ type: 'error', text: 'File kosong atau tidak memiliki data.' });
        return;
      }
      setCsvFile(file);
      setHeaders(hdrs);
      setAllRows(dataRows);
      setFilename(file.name.replace(/\.(csv|txt|xlsx|xls)$/i, ''));

      const findCol = (patterns: RegExp[]) => hdrs.find((h) => patterns.some((p) => p.test(h.toLowerCase())));
      const autoLat = findCol([/^lat/, /latitude/, /lintang/]);
      const autoLng = findCol([/^lon/, /^lng/, /longitude/, /bujur/]);
      const autoTitle = findCol([/^name$/, /^nama$/, /title/, /^id$/]);

      setMapping({ lat: autoLat || '', lng: autoLng || '', title: autoTitle || '', status: '', description: [] });
      setFolderLevels([]);
      setCheckedStatuses({});
      setIconMapping({ DEFAULT: defaultIconConfig('#888888') });
      setAlert(null);
    };

    if (fileExt === 'csv' || fileExt === 'txt') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        let text = String(ev.target?.result || '');
        text = text.replace(/^\uFEFF/, '');
        const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') || '';
        const delimiter = detectDelimiter(firstLine);
        const rows = parseCsvText(text, delimiter);

        if (rows.length < 2) {
          setAlert({ type: 'error', text: 'File CSV kosong atau tidak memiliki data.' });
          return;
        }

        const hdrs = rows[0].map((h) => h.trim());
        const dataRows = rows.slice(1).map((r) => {
          const obj: Record<string, string> = {};
          hdrs.forEach((h, i) => (obj[h] = (r[i] ?? '').trim()));
          return obj;
        });

        applyParsedData(hdrs, dataRows);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });

          if (rawRows.length === 0) {
            setAlert({ type: 'error', text: 'Sheet Excel kosong.' });
            return;
          }

          const hdrs = Object.keys(rawRows[0] as object);
          const dataRows = rawRows.map((r: any) => {
            const obj: Record<string, string> = {};
            hdrs.forEach((h) => {
              obj[h] = String(r[h] ?? '').trim();
            });
            return obj;
          });

          applyParsedData(hdrs, dataRows);
        } catch {
          setAlert({ type: 'error', text: 'Gagal membaca file Excel. Pastikan format file tidak korup.' });
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleStatusFieldChange = (field: string) => {
    setMapping((prev) => ({ ...prev, status: field }));
    if (!field) {
      setCheckedStatuses({});
      return;
    }
    const values = new Set<string>();
    allRows.forEach((r) => values.add(r[field] || 'UNKNOWN'));
    const checks: Record<string, boolean> = {};
    const icons: Record<string, IconConfig> = { DEFAULT: defaultIconConfig('#888888') };
    values.forEach((v) => {
      checks[v] = true;
      icons[v] = defaultIconConfig(autoColorFromString(v));
    });
    setCheckedStatuses(checks);
    setIconMapping(icons);
  };

  const toggleDescriptionField = (field: string) => {
    setMapping((prev) => ({
      ...prev,
      description: prev.description.includes(field)
        ? prev.description.filter((f) => f !== field)
        : [...prev.description, field],
    }));
  };

  const addFolderLevel = (field: string) => {
    if (!folderLevels.includes(field)) setFolderLevels((prev) => [...prev, field]);
  };
  const removeFolderLevel = (field: string) => setFolderLevels((prev) => prev.filter((f) => f !== field));
  const moveFolderLevel = (index: number, dir: -1 | 1) => {
    setFolderLevels((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const treePreview = useMemo(() => {
    if (folderLevels.length === 0 || allRows.length === 0) return null;
    return groupPreview(allRows, folderLevels);
  }, [allRows, folderLevels]);

  const isMappingComplete = !!(mapping.lat && mapping.lng && mapping.title);

  const handleGenerate = async () => {
    if (!csvFile || !isMappingComplete) {
      setAlert({ type: 'error', text: 'Lengkapi mapping Latitude, Longitude, dan Title terlebih dahulu.' });
      return;
    }

    setIsLoading(true);
    setAlert(null);

    try {
      const filters = mapping.status
        ? Object.entries(checkedStatuses)
            .filter(([, checked]) => checked)
            .map(([value]) => value)
        : [];

      const config = {
        mapping,
        folderLevels,
        filters,
        filename: filename || 'output',
        format,
        iconMapping,
      };

      const formData = new FormData();
      formData.append('csv_file', csvFile);
      formData.append('config', JSON.stringify(config));

      const response = await fetch('/api/csv-to-kml', { method: 'POST', body: formData });

      if (!response.ok) {
        let msg = `Server merespons dengan status ${response.status}.`;
        try {
          const data = await response.json();
          if (data?.message) msg = data.message;
        } catch {
          /* biarkan pesan default */
        }
        throw new Error(msg);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename || 'output'}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setAlert({ type: 'success', text: 'File berhasil dibuat dan sedang diunduh!' });
    } catch (error: any) {
      setAlert({ type: 'error', text: error.message || 'Gagal membuat file.' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetAll = () => {
    setCsvFile(null);
    setHeaders([]);
    setAllRows([]);
    setMapping({ lat: '', lng: '', title: '', status: '', description: [] });
    setFolderLevels([]);
    setCheckedStatuses({});
    setIconMapping({});
    setFilename('output');
    setFormat('kml');
    setAlert(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <MainLayout pageTitle="CSV to KML Converter" activeMenu="csv-to-kml">
      <div className="c2k-wrapper">
        {/* ============ STEP 1: UPLOAD ============ */}
        <div className="c2k-section">
           <label className="form-label">Upload File CSV / Excel <span style={{color: '#EF4444'}}>*</span></label>
          <div
            className={`c2k-upload-zone ${csvFile ? 'has-file' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) {
                const dt = new DataTransfer();
                dt.items.add(f);
                if (fileInputRef.current) fileInputRef.current.files = dt.files;
                handleFileChange({ target: { files: dt.files, value: '' } } as any);
              }
            }}
          >
            <div className="c2k-upload-icon">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
            </div>
            <div className="c2k-upload-title">
              {csvFile ? csvFile.name : 'Klik untuk memilih file atau drag & drop di sini'}
            </div>
            <div className="c2k-upload-subtitle">
              {csvFile ? `${allRows.length} baris data terbaca` : 'Format: CSV / TXT / XLSX / XLS'}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
          {csvFile && (
            <button className="c2k-btn-reset" onClick={resetAll} type="button">
              Ganti file
            </button>
          )}
        </div>

        {csvFile && headers.length > 0 && (
          <>
            {/* ============ STEP 2: FIELD MAPPING ============ */}
            <div className="c2k-section">
              <div className="c2k-section-title">2. Pemetaan Kolom (Field Mapping)</div>
              <div className="c2k-mapping-grid">
                <div className="c2k-form-col">
                  <label className="c2k-label">Latitude <span className="required">*</span></label>
                  <select
                    className="c2k-input"
                    value={mapping.lat}
                    onChange={(e) => setMapping((p) => ({ ...p, lat: e.target.value }))}
                  >
                    <option value="">-- Pilih kolom --</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="c2k-form-col">
                  <label className="c2k-label">Longitude <span className="required">*</span></label>
                  <select
                    className="c2k-input"
                    value={mapping.lng}
                    onChange={(e) => setMapping((p) => ({ ...p, lng: e.target.value }))}
                  >
                    <option value="">-- Pilih kolom --</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="c2k-form-col">
                  <label className="c2k-label">Title / Nama <span className="required">*</span></label>
                  <select
                    className="c2k-input"
                    value={mapping.title}
                    onChange={(e) => setMapping((p) => ({ ...p, title: e.target.value }))}
                  >
                    <option value="">-- Pilih kolom --</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="c2k-form-col">
                  <label className="c2k-label">Status (opsional)</label>
                  <select
                    className="c2k-input"
                    value={mapping.status}
                    onChange={(e) => handleStatusFieldChange(e.target.value)}
                  >
                    <option value="">-- Tidak digunakan --</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <label className="c2k-label" style={{ marginTop: 16, display: 'block' }}>
                Kolom untuk Description (boleh lebih dari satu)
              </label>
              <div className="c2k-checkbox-grid">
                {headers.map((h) => (
                  <label key={h} className="c2k-checkbox-item">
                    <input
                      type="checkbox"
                      checked={mapping.description.includes(h)}
                      onChange={() => toggleDescriptionField(h)}
                    />
                    {h}
                  </label>
                ))}
              </div>
            </div>

            {/* ============ STEP 3: FOLDER STRUCTURE ============ */}
            <div className="c2k-section">
              <div className="c2k-section-title">3. Struktur Folder KML</div>
              <p className="c2k-help-text">
                Pilih kolom untuk membuat folder bertingkat (mis. Region → Status). Urutan menentukan tingkat kedalaman folder.
              </p>
              <div className="c2k-folder-builder">
                <div className="c2k-field-pool">
                  <div className="c2k-pool-title">Kolom tersedia</div>
                  {headers.filter((h) => !folderLevels.includes(h)).map((h) => (
                    <div key={h} className="c2k-field-chip" onClick={() => addFolderLevel(h)}>
                      + {h}
                    </div>
                  ))}
                </div>
                <div className="c2k-folder-levels">
                  <div className="c2k-pool-title">Struktur folder (urutan)</div>
                  {folderLevels.length === 0 && <div className="c2k-empty-hint">Belum ada folder — semua data jadi 1 level.</div>}
                  {folderLevels.map((f, i) => (
                    <div key={f} className="c2k-level-chip">
                      <span className="c2k-level-order">{i + 1}</span>
                      <span className="c2k-level-name">{f}</span>
                      <button type="button" onClick={() => moveFolderLevel(i, -1)} disabled={i === 0}>↑</button>
                      <button type="button" onClick={() => moveFolderLevel(i, 1)} disabled={i === folderLevels.length - 1}>↓</button>
                      <button type="button" className="c2k-remove-btn" onClick={() => removeFolderLevel(f)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
              {treePreview && (
                <div className="c2k-tree-preview">
                  <div className="c2k-pool-title">Preview struktur</div>
                  <TreePreview node={treePreview} />
                </div>
              )}
            </div>

            {/* ============ STEP 4: ICON MAPPING PER STATUS ============ */}
            {mapping.status && statusValues.length > 0 && (
              <div className="c2k-section">
                <div className="c2k-section-title">4. Ikon &amp; Warna per Status</div>
                <div className="c2k-status-list">
                  {statusValues.map((sv) => {
                    const cfg = iconMapping[sv] || defaultIconConfig('#888888');
                    return (
                      <div key={sv} className="c2k-status-row">
                        <label className="c2k-status-check">
                          <input
                            type="checkbox"
                            checked={checkedStatuses[sv] ?? true}
                            onChange={(e) =>
                              setCheckedStatuses((prev) => ({ ...prev, [sv]: e.target.checked }))
                            }
                          />
                          <span className="c2k-status-name">{sv}</span>
                        </label>
                        <div className="c2k-icon-select-row">
                          {ICON_OPTIONS.map((icon) => (
                            <img
                              key={icon.id}
                              src={icon.url}
                              alt={icon.id}
                              title={icon.id}
                              className={`c2k-icon-thumb ${cfg.iconUrl === icon.url ? 'selected' : ''}`}
                              onClick={() =>
                                setIconMapping((prev) => ({
                                  ...prev,
                                  [sv]: { ...cfg, iconUrl: icon.url },
                                }))
                              }
                            />
                          ))}
                        </div>
                        <input
                          type="color"
                          className="c2k-color-input"
                          value={cfg.color}
                          onChange={(e) =>
                            setIconMapping((prev) => ({ ...prev, [sv]: { ...cfg, color: e.target.value } }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============ STEP 5: OUTPUT & GENERATE ============ */}
            <div className="c2k-section">
              <div className="c2k-section-title">5. Output</div>
              <div className="c2k-mapping-grid">
                <div className="c2k-form-col">
                  <label className="c2k-label">Nama File</label>
                  <input
                    className="c2k-input"
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder="output"
                  />
                </div>
                <div className="c2k-form-col">
                  <label className="c2k-label">Format</label>
                  <select className="c2k-input" value={format} onChange={(e) => setFormat(e.target.value as 'kml' | 'kmz')}>
                    <option value="kml">KML</option>
                    <option value="kmz">KMZ (di-zip)</option>
                  </select>
                </div>
              </div>

              <button
                className="c2k-btn-generate"
                disabled={!isMappingComplete || isLoading}
                onClick={handleGenerate}
                type="button"
              >
                {isLoading ? 'MEMPROSES...' : 'GENERATE & DOWNLOAD'}
              </button>
            </div>
          </>
        )}

        {alert && <div className={`c2k-alert c2k-alert-${alert.type}`}>{alert.text}</div>}
      </div>
    </MainLayout>
  );
};

export default CsvToKmlConverter;