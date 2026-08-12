import React, { useState, useRef } from 'react';
import MainLayout from '../components/MainLayout'; // Sesuaikan path jika berbeda
import '../assets/KmlToCsv.css';
export default function KmlToCsv() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memicu klik pada input file tersembunyi
  const handleZoneClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Menangkap file dari input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.toLowerCase().endsWith('.kml')) {
        setFile(selectedFile);
      } else {
        alert("Mohon unggah file dengan format .kml");
        e.target.value = ''; // Reset input
      }
    }
  };

  // Logika Utama: Konversi KML ke CSV lewat backend (server.ts -> /api/kml-to-csv)
  // Backend menangani SEMUA tipe geometri (Point, LineString, Polygon, MultiGeometry)
  // dan mengambil seluruh key dari <description> secara dinamis + kolom WKT.
  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/kml-to-csv', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMsg = `Server merespons dengan status ${response.status}.`;
        try {
          const errData = await response.json();
          if (errData?.error) errMsg = errData.error;
        } catch {
          /* body bukan JSON, pakai pesan default di atas */
        }
        throw new Error(errMsg);
      }

      // Ambil nama file dari header Content-Disposition, fallback ke nama file asli
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = file.name.replace(/\.kml$/i, '.csv');
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error: any) {
      console.error('Gagal memproses KML:', error);
      alert('Terjadi kesalahan saat mengonversi file KML: ' + (error.message || 'Tidak diketahui'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MainLayout pageTitle="KML to CSV Converter" activeMenu="kml-to-csv">
      
      {/* 2. PANGGIL CLASS CSS DI SINI */}
      <div className="kml-container">
        <div className="file-kml" style={{ position: 'static', marginBottom: '8px' }}>
            <span>
              <span className="file-kml-span">File KML</span>
              <span style={{color: '#EF4444'}}>*</span>
            </span>
          </div>
        <div 
          className={`kml2csv-upload-zone ${file ? 'has-file' : ''}`} 
          onClick={handleZoneClick}
          style={{ width: '100%' }} // Tetap sisakan ini untuk memastikan garis putus-putus penuh
        >
          <input 
            type="file" 
            accept=".kml"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }} 
          />
          
          {!file ? (
            <div className="kml-upload-wrapper">
              <div className="file-upload-icon">
                  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
        
              <p className="kml-subtitle">Klik untuk memilih file atau drag &amp; drop di sini</p>
            </div>
          ) : (
            <div className="kml-upload-wrapper">
              <h3 className="kml-title success">✅ File Terpilih:</h3>
              <p className="kml-filename">{file.name}</p>
              <p className="kml-subtitle">
                {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>
          )}
        </div>

        <div className="kml-action-area">
          <button 
            className="kml-btn-convert"
            onClick={handleConvert}
            disabled={!file || isProcessing}
            style={{
              backgroundColor: (file && !isProcessing) ? '#4d535e' : '#94a3b8'
            }}
          >
            {isProcessing ? 'Memproses...' : 'Konversi ke CSV'}
          </button>
        </div>

      </div>
    </MainLayout>
  );
}