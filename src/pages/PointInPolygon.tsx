import React, { useState, useRef } from 'react';
import MainLayout from '../components/MainLayout';
import '../assets/PointInPolygon.css'; 

const PointInPolygon: React.FC = () => {
  const [pointsFile, setPointsFile] = useState<File | null>(null);
  const [polygonsFile, setPolygonsFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const [isDragOverPoints, setIsDragOverPoints] = useState<boolean>(false);
  const [isDragOverPolys, setIsDragOverPolys] = useState<boolean>(false);
  
  const pointsInputRef = useRef<HTMLInputElement>(null);
  const polygonsInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pointsFile) return alert("File Points KML/KMZ wajib diunggah!");
    if (!polygonsFile) return alert("File Polygons KML/KMZ wajib diunggah!");
    
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('points', pointsFile);
      formData.append('polygons', polygonsFile);

      const response = await fetch('/api/point-in-polygon', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Gagal memproses data.');
      }

      const disposition = response.headers.get('Content-Disposition');
      let filename = 'point_in_polygon_result.csv';
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

      alert("Analisis selesai! File CSV berhasil diunduh.");
    } catch (error: any) {
      alert("Terjadi kesalahan: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MainLayout pageTitle="Point in Polygon" activeMenu="point-in-polygon">
      <div className="card">
        <div className="card-header">
        </div>

        <div className="card-body">
          <form onSubmit={handleGenerate}>
            
            {/* Tata letak dua kolom meniru desain HTML asli Anda */}
            <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              
              {/* Kolom 1: Points */}
              <div className="form-col" style={{ flex: 1 }}>
                <div className="form-group">
                  <label className="form-label">File Points (KML) <span style={{color: '#EF4444'}}>*</span></label>
                  <div 
                    className={`file-upload-area ${pointsFile ? 'has-file' : ''} ${isDragOverPoints ? 'dragover' : ''}`}
                    onClick={() => pointsInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOverPoints(true); }}
                    onDragLeave={() => setIsDragOverPoints(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverPoints(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        setPointsFile(e.dataTransfer.files[0]);
                      }
                    }}
                  >
                    <div className="file-upload-icon">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Upload file points KML/KMZ</p>
                    <input 
                      type="file" 
                      ref={pointsInputRef}
                      accept=".kml,.kmz" 
                      onChange={(e) => e.target.files && setPointsFile(e.target.files[0])}
                      style={{ display: 'none' }} 
                    />
                    <div className="file-name">
                      {pointsFile ? pointsFile.name : 'Belum ada file dipilih'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Kolom 2: Polygons */}
              <div className="form-col" style={{ flex: 1 }}>
                <div className="form-group">
                  <label className="form-label">File Polygons (KML) <span style={{color: '#EF4444'}}>*</span></label>
                  <div 
                    className={`file-upload-area ${polygonsFile ? 'has-file' : ''} ${isDragOverPolys ? 'dragover' : ''}`}
                    onClick={() => polygonsInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOverPolys(true); }}
                    onDragLeave={() => setIsDragOverPolys(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverPolys(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        setPolygonsFile(e.dataTransfer.files[0]);
                      }
                    }}
                  >
                    <div className="file-upload-icon">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Upload file polygons KML/KMZ</p>
                    <input 
                      type="file" 
                      ref={polygonsInputRef}
                      accept=".kml,.kmz" 
                      onChange={(e) => e.target.files && setPolygonsFile(e.target.files[0])}
                      style={{ display: 'none' }} 
                    />
                    <div className="file-name">
                      {polygonsFile ? polygonsFile.name : 'Belum ada file dipilih'}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <div className="button-separator">
              <button type="submit" className="btn-block" disabled={isProcessing}>
                {isProcessing ? 'Memproses...' : 'Proses & Unduh CSV'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default PointInPolygon;