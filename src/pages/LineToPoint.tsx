import React, { useState, useRef } from 'react';
import MainLayout from '../components/MainLayout';
import '../assets/LineToPoint.css';

const AVAILABLE_ICONS = [
  { name: 'U', url: 'https://maps.google.com/mapfiles/kml/paddle/U.png' },
  { name: 'L', url: 'https://maps.google.com/mapfiles/kml/paddle/L.png' },
  { name: 'Yellow Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/ylw-circle.png' },
  { name: 'Red Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/red-circle.png' },
  { name: 'Blue Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/blu-circle.png' },
  { name: 'Green Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/grn-circle.png' },
  { name: 'Pink Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/pink-circle.png' },
  { name: 'White Circle', url: 'https://maps.google.com/mapfiles/kml/paddle/wht-circle.png' },
  { name: 'Circle Dot', url: 'https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png' },
  { name: 'Flag', url: 'https://maps.google.com/mapfiles/kml/shapes/flag.png' },
  { name: 'Home', url: 'https://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png' }
];

const LineToPoint: React.FC = () => {
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [distance, setDistance] = useState<number>(100);
  const [placemarkName, setPlacemarkName] = useState<string>('Titik {n}');
  const [selectedIcon, setSelectedIcon] = useState<string>('Yellow Circle');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setKmlFile(e.target.files[0]);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kmlFile) {
      alert("File KML/KMZ wajib diunggah!");
      return;
    }
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('kmlFile', kmlFile);
      formData.append('distance', distance.toString());
      formData.append('placemarkName', placemarkName);
      formData.append('placemarkIcon', selectedIcon);

      const response = await fetch('/api/line-to-point', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Gagal memproses data.');
      }

      const disposition = response.headers.get('Content-Disposition');
      let filename = 'line_to_point_result.kml';
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="(.+?)"/);
        if (match && match[1]) filename = match[1];
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      alert("File KML berhasil digenerate dan diunduh!");
    } catch (error: any) {
      alert("Terjadi kesalahan: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MainLayout pageTitle="Line to Point" activeMenu="line-to-point">
      <div className="card">
        
        {/* Header Kartu dengan Icon Route SVG */}
        <div className="card-header">
         
        </div>

        <div className="card-body">
          <form onSubmit={handleGenerate}>
            
            <div className="form-group">
              <label className="form-label">File KML/KMZ <span style={{color: '#EF4444'}}>*</span></label>
              <div 
                className={`file-upload-area ${kmlFile ? 'has-file' : ''} ${isDragOver ? 'dragover' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    setKmlFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                {/* Icon Awan Upload SVG */}
                <div className="file-upload-icon">
                  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <p style={{ margin: 0 }}>Klik untuk memilih file atau drag & drop di sini</p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".kml,.kmz" 
                  onChange={handleFileChange}
                  style={{ display: 'none' }} 
                />
                <div className="file-name">
                  {kmlFile ? kmlFile.name : 'Belum ada file dipilih'}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Jarak Antar Titik (meter) <span style={{color: '#EF4444'}}>*</span></label>
              <input 
                type="number" 
                className="form-control" 
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
                min="1" 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Pola Nama Placemark</label>
              <input 
                type="text" 
                className="form-control" 
                value={placemarkName}
                onChange={(e) => setPlacemarkName(e.target.value)}
                placeholder="Gunakan {n} untuk nomor urut" 
              />
            </div>

            <div className="form-group">
              {/* Icon Marker SVG */}
              <div className="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                Pilih Ikon Penanda
              </div>
              
              <div className="ltp-icon-flex">
                {AVAILABLE_ICONS.map((icon) => (
                  <div 
                    key={icon.name}
                    className={`ltp-icon-option ${selectedIcon === icon.name ? 'selected' : ''}`}
                    onClick={() => setSelectedIcon(icon.name)}
                  >
                    <img src={icon.url} alt={icon.name} className="ltp-icon-image" />
                    <span className="ltp-icon-name">{icon.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="button-separator">
              <button type="submit" className="btn-block" disabled={isProcessing}>
                {isProcessing ? 'Memproses...' : 'Generate & Download'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default LineToPoint;