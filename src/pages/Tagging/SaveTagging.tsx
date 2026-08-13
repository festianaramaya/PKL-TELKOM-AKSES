import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/SaveTagging.css';

interface TaggingMarkerData {
  id: string;
  lat: number;
  lng: number;
  type: string;
  label?: string;
  keterangan?: string;
}

export const SaveTagging: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as {
    fileSize?: string;
    markers?: TaggingMarkerData[];
  } | null;

  const markers = locationState?.markers || [];

  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  // Helper Konversi Ukuran Byte -> KB / MB
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Fungsi Pembuat File .kml Sungguhan
  const generateKmlBlob = (docName: string, points: TaggingMarkerData[]): Blob => {
    const placemarksXml = points
      .map(
        (p) => `
    <Placemark>
      <name>${p.label || p.type}</name>
      <description>Tipe: ${p.type}${p.keterangan ? ' - Ket: ' + p.keterangan : ''}</description>
      <Point>
        <coordinates>${p.lng},${p.lat},0</coordinates>
      </Point>
    </Placemark>`
      )
      .join('');

    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${docName}</name>
    ${placemarksXml}
  </Document>
</kml>`;

    return new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
  };

  const handleLanjutkan = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanedName = fileName.trim();

    if (!cleanedName) {
      setError(true);
      return;
    }

    if (!cleanedName.toLowerCase().endsWith('.kml')) {
      cleanedName += '.kml';
    }

    // 1. Buat Blob File KML Asli
    const kmlBlob = generateKmlBlob(cleanedName, markers);

    // 2. Buat URL Download yang Bisa Dipakai browser
    const fileUrl = URL.createObjectURL(kmlBlob);
    const actualSize = formatBytes(kmlBlob.size);

    // 3. Kirim File URL, Ukuran Asli, & Markers ke TaggingShare
    navigate('/tagging/share', {
      state: {
        fileName: cleanedName,
        fileSize: actualSize,
        fileUrl: fileUrl,
        markers: markers,
      },
    });
  };

  return (
    <MainLayout pageTitle="Tagging SAVE" activeMenu="tagging">
      <div className="save-tagging-page">
        <div className="share-rename-container">
          <div className="audit-icon-wrapper">
            <img
              src="/images/audit.png"
              alt="Audit Icon"
              className="audit-icon-img"
            />
          </div>

          <h2 className="rename-title">Simpan hasil tagging Anda</h2>
          <p className="rename-subtitle">
            Masukkan nama file sebelum melanjutkan untuk membagikan hasil tagging.
          </p>

          <form onSubmit={handleLanjutkan} className="rename-form">
            <div className="rename-field-group">
              <label htmlFor="fileName" className="rename-label">
                Nama file <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div className={`rename-input-box ${error ? 'input-error' : ''}`}>
                <input
                  type="text"
                  id="fileName"
                  placeholder="Contoh: Tagging_ODC_20260811"
                  value={fileName}
                  onChange={(e) => {
                    setFileName(e.target.value);
                    if (e.target.value.trim()) setError(false);
                  }}
                  autoFocus
                />
                <div className="kml-badge-suffix">.kml</div>
              </div>
              {error && (
                <span className="error-text">Nama file wajib diisi terlebih dahulu!</span>
              )}
            </div>

            <button type="submit" className="btn-lanjutkan-figma">
              Lanjutkan
            </button>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default SaveTagging;