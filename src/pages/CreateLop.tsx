import React, { useState, FormEvent, useRef } from 'react';
import MainLayout from '../components/MainLayout';
import '../assets/CreateLop.css';

// ============================================================
// Konfigurasi ini HARUS selaras dengan server.ts (LOP_CATEGORIES & AVAILABLE_ICONS)
// ============================================================

// Kategori LOP -> field name upload BOQ di backend ('boq_' + key kecil, '-' jadi '_')
const BOQ_CATEGORIES: { key: string; label: string; fieldName: string }[] = [
  { key: 'PT2-UNLOCK', label: 'PT2-Unlock', fieldName: 'boq_pt2_unlock' },
  { key: 'PT2-EXPAND', label: 'PT2-Expand', fieldName: 'boq_pt2_expand' },
  { key: 'PT2-RAPID', label: 'PT2-Rapid', fieldName: 'boq_pt2_rapid' },
  { key: 'PT2-OSP', label: 'PT2-OSP', fieldName: 'boq_pt2_osp' },
  { key: 'OPSIONAL', label: 'Opsional', fieldName: 'boq_opsional' },
];

// Daftar ikon penanda -- URL sama persis dengan AVAILABLE_ICONS di server.ts
const ICON_OPTIONS: { id: string; name: string; url: string }[] = [
  { id: 'U', name: 'U', url: 'https://maps.google.com/mapfiles/kml/paddle/U.png' },
  { id: 'L', name: 'L', url: 'https://maps.google.com/mapfiles/kml/paddle/L.png' },
  { id: 'Yellow Circle', name: 'Yellow Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/ylw-circle.png' },
  { id: 'Red Circle', name: 'Red Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/red-circle.png' },
  { id: 'Blue Circle', name: 'Blue Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/blu-circle.png' },
  { id: 'Green Circle', name: 'Green Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/grn-circle.png' },
  { id: 'Pink Circle', name: 'Pink Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/pink-circle.png' },
  { id: 'White Circle', name: 'White Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/wht-circle.png' },
  { id: 'Circle Dot', name: 'Circle Dot', url: 'https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png' },
  { id: 'Flag', name: 'Flag', url: 'https://maps.google.com/mapfiles/kml/shapes/flag.png' },
  { id: 'Home', name: 'Home', url: 'https://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png' },
];

type AlertState = { type: 'success' | 'error'; text: string } | null;

const CreateLop: React.FC = () => {
  // State untuk Data ODP
  const [fileOdp, setFileOdp] = useState<File | null>(null);
  const odpInputRef = useRef<HTMLInputElement>(null);

  // State untuk CSV Referensi (opsional, acuan tambahan)
  const [fileReferensi, setFileReferensi] = useState<File | null>(null);
  const referensiInputRef = useRef<HTMLInputElement>(null);

  // State BOQ per kategori, key-nya memakai fieldName backend langsung
  const [boqFiles, setBoqFiles] = useState<{ [fieldName: string]: File | null }>(
    Object.fromEntries(BOQ_CATEGORIES.map(c => [c.fieldName, null]))
  );
  const boqRefs = useRef<{ [fieldName: string]: HTMLInputElement | null }>({});

  // State input teks dan dropdown
  const [namaDokumen, setNamaDokumen] = useState<string>('');
  const [outputMode, setOutputMode] = useState<'kml' | 'zip'>('kml');
  const [iconMarker, setIconMarker] = useState<string>('U');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [alert, setAlert] = useState<AlertState>(null);

  const handleBoqFileChange = (fieldName: string, file: File | null) => {
    setBoqFiles(prev => ({ ...prev, [fieldName]: file }));
  };

  const resetForm = () => {
    setFileOdp(null);
    setFileReferensi(null);
    setBoqFiles(Object.fromEntries(BOQ_CATEGORIES.map(c => [c.fieldName, null])));
    setNamaDokumen('');
    setOutputMode('kml');
    setIconMarker('U');
    if (odpInputRef.current) odpInputRef.current.value = '';
    if (referensiInputRef.current) referensiInputRef.current.value = '';
    Object.values(boqRefs.current).forEach(el => { if (el) el.value = ''; });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fileOdp) {
      setAlert({ type: 'error', text: 'Mohon lengkapi Data ODP terlebih dahulu.' });
      return;
    }

    setIsLoading(true);
    setAlert(null);

    // Nama field HARUS sama dengan yang dibaca server.ts: odp, docname, mode, icon, boq_*, referensi
    const formData = new FormData();
    formData.append('odp', fileOdp);
    formData.append('docname', namaDokumen);
    formData.append('mode', outputMode);
    formData.append('icon', iconMarker);

    if (fileReferensi) formData.append('referensi', fileReferensi);

    BOQ_CATEGORIES.forEach(({ fieldName }) => {
      const file = boqFiles[fieldName];
      if (file) formData.append(fieldName, file);
    });

    try {
      // Path relatif -- backend Express (server.ts) melayani frontend & API di origin yang sama
      const response = await fetch('/api/create-lop', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Backend mengirim JSON { success:false, message } saat gagal
        let errMsg = 'Terjadi kesalahan server.';
        try {
          const errData = await response.json();
          errMsg = errData.message || errMsg;
        } catch {
          /* respons bukan JSON, pakai pesan default */
        }
        throw new Error(errMsg);
      }

      // Ambil nama file dari header Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = outputMode === 'zip' ? 'LOP.zip' : 'LOP.kml';
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

      setAlert({ type: 'success', text: 'File berhasil diproses dan sedang diunduh!' });
      resetForm();
    } catch (error: any) {
      console.error('Error:', error);
      setAlert({ type: 'error', text: error.message || 'Gagal memproses data.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout pageTitle="Create LOP" activeMenu="create-lop">
    <div className="create-lop-wrapper">
      <form onSubmit={handleSubmit} className="lop-form-container">

        {/* ================= BARIS 1: UPLOAD AREA ================= */}
        <div className="lop-top-section">
          <div className="lop-dual-upload-row">
          {/* Data ODP */}
          <div className="lop-odp-col">
            <label className="lop-form-label">
             
              Data ODP <span>*</span>
            </label>
            <div
              className={`lop-upload-zone large-zone ${fileOdp ? 'has-file' : ''}`}
              onClick={() => odpInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) setFileOdp(f);
              }}
            >
              <div className="lop-upload-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <div className="lop-upload-title">
                {fileOdp ? fileOdp.name : 'Klik untuk memilih file atau drag & drop di sini'}
              </div>
              <div className="lop-upload-subtitle">
                {fileOdp ? 'Siap diproses' : 'Belum ada file dipilih'}
              </div>
            </div>
            <span className="lop-help-text">
              Format: CSV / XLSX. Kolom wajib: <strong>Nama ODP, Latitude, Longitude, Nama Lop Auto, LOP Category</strong>
            </span>
            <input
              type="file"
              ref={odpInputRef}
              accept=".csv,.xlsx,.xls,.xlsm"
              style={{ display: 'none' }}
              onChange={(e) => setFileOdp(e.target.files ? e.target.files[0] : null)}
            />
          </div>

          {/* CSV Referensi (opsional) */}
          <div className="lop-odp-col">
            <label className="lop-form-label">
              CSV Referensi
            </label>
            <div
              className={`lop-upload-zone large-zone ${fileReferensi ? 'has-file' : ''}`}
              onClick={() => referensiInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) setFileReferensi(f);
              }}
            >
              <div className="lop-upload-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <div className="lop-upload-title">
                {fileReferensi ? fileReferensi.name : 'Klik untuk memilih file atau drag & drop di sini'}
              </div>
              <div className="lop-upload-subtitle">
                {fileReferensi ? 'Siap diproses' : 'Belum ada file dipilih'}
              </div>
            </div>
            <span className="lop-help-text">
              Format: CSV. File acuan tambahan untuk proses Create LOP (opsional).
            </span>
            <input
              type="file"
              ref={referensiInputRef}
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => setFileReferensi(e.target.files ? e.target.files[0] : null)}
            />
          </div>
          </div>

          {/* BOQ Kategori (Grid) */}
          <div className="lop-boq-col">
            <label className="lop-form-label">
              
              File BOQ per Kategori (Opsional, hanya dipakai jika Output = ZIP)
            </label>
            <div className="boq-grid-container">
              {BOQ_CATEGORIES.map(({ fieldName, label }) => {
                const file = boqFiles[fieldName];
                return (
                  <div key={fieldName} className="boq-upload-item">
                    <div
                      className={`lop-upload-zone small-zone ${file ? 'has-file' : ''}`}
                      onClick={() => boqRefs.current[fieldName]?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleBoqFileChange(fieldName, f);
                      }}
                    >
                      <div className="lop-upload-icon small-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      </div>
                      <div className="lop-upload-title">{label}</div>
                      <div className="lop-upload-subtitle">{file ? file.name : 'Belum ada file dipilih'}</div>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.xlsm"
                      ref={(el) => { boqRefs.current[fieldName] = el; }}
                      style={{ display: 'none' }}
                      onChange={(e) => handleBoqFileChange(fieldName, e.target.files ? e.target.files[0] : null)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================= BARIS 2: NAMA DOKUMEN & OUTPUT ================= */}
        <div className="lop-input-row">
          <div className="lop-form-col">
            <label className="lop-form-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              Nama Dokumen
            </label>
            <input
              type="text"
              className="lop-input-text"
              placeholder="Misal: 3SBU Project"
              maxLength={100}
              value={namaDokumen}
              onChange={(e) => setNamaDokumen(e.target.value)}
            />
          </div>
          <div className="lop-form-col">
            <label className="lop-form-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              Output <span>*</span>
            </label>
            <select
              className="lop-input-text"
              value={outputMode}
              onChange={(e) => setOutputMode(e.target.value as 'kml' | 'zip')}
            >
              <option value="kml">KML gabungan (1 file)</option>
              <option value="zip">ZIP: folder per LOP + BOQ</option>
            </select>
          </div>
        </div>

        {/* ================= BARIS 3: IKON PENANDA ================= */}
        <div className="lop-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          Pilih Ikon Penanda
        </div>
        <div className="lop-icon-flex">
          {ICON_OPTIONS.map((icon) => (
            <div
              key={icon.id}
              className={`lop-icon-option ${iconMarker === icon.id ? 'selected' : ''}`}
              onClick={() => setIconMarker(icon.id)}
            >
              <img src={icon.url} alt={icon.name} className="lop-icon-image" />
              <span className="lop-icon-name">{icon.name}</span>
            </div>
          ))}
        </div>

        <button type="submit" disabled={isLoading} className="lop-btn-submit">
          {isLoading ? (
            <span className="lop-btn-loading">
              <span className="lop-spinner" /> MEMPROSES...
            </span>
          ) : 'GENERATE'}
        </button>
      </form>

      {alert && (
        <div className={`lop-alert lop-alert-${alert.type}`}>
          {alert.text}
        </div>
      )}
    </div>
    </MainLayout>
  );
};

export default CreateLop;