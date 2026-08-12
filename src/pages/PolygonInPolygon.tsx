import React, { useState, useRef } from 'react';
import MainLayout from '../components/MainLayout';
import '../assets/PolygonInPolygon.css'; 

const PolygonInPolygon: React.FC = () => {
  const [smallKmlFile, setSmallKmlFile] = useState<File | null>(null);
  const [bigKmlFile, setBigKmlFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const [isDragOverSmall, setIsDragOverSmall] = useState<boolean>(false);
  const [isDragOverBig, setIsDragOverBig] = useState<boolean>(false);
  
  const smallInputRef = useRef<HTMLInputElement>(null);
  const bigInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smallKmlFile) return alert("File Polygon Kecil wajib diunggah!");
    if (!bigKmlFile) return alert("File Polygon Besar wajib diunggah!");
    
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('small_kml', smallKmlFile);
      formData.append('big_kml', bigKmlFile);

      const response = await fetch('/api/polygon-in-polygon', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Gagal memproses data.');
      }

      const disposition = response.headers.get('Content-Disposition');
      let filename = 'polygon_analysis.csv';
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
    <MainLayout pageTitle="Polygon in Polygon" activeMenu="polygon-in-polygon">
      <div className="card">
        <div className="card-header">
        </div>

        <div className="card-body">
          <form onSubmit={handleGenerate}>
            
            <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              
              {/* Kolom 1: Polygon Kecil */}
              <div className="form-col" style={{ flex: 1 }}>
                <div className="form-group">
                  <label className="form-label">File Polygon Kecil <span style={{color: '#EF4444'}}>*</span></label>
                  <div 
                    className={`file-upload-area ${smallKmlFile ? 'has-file' : ''} ${isDragOverSmall ? 'dragover' : ''}`}
                    onClick={() => smallInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOverSmall(true); }}
                    onDragLeave={() => setIsDragOverSmall(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverSmall(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        setSmallKmlFile(e.dataTransfer.files[0]);
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
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Upload file polygon kecil (multiple polygons)</p>
                    <input 
                      type="file" 
                      ref={smallInputRef}
                      accept=".kml,.kmz" 
                      onChange={(e) => e.target.files && setSmallKmlFile(e.target.files[0])}
                      style={{ display: 'none' }} 
                    />
                    <div className="file-name">
                      {smallKmlFile ? smallKmlFile.name : 'Belum ada file dipilih'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Kolom 2: Polygon Besar */}
              <div className="form-col" style={{ flex: 1 }}>
                <div className="form-group">
                  <label className="form-label">File Polygon Besar <span style={{color: '#EF4444'}}>*</span></label>
                  <div 
                    className={`file-upload-area ${bigKmlFile ? 'has-file' : ''} ${isDragOverBig ? 'dragover' : ''}`}
                    onClick={() => bigInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOverBig(true); }}
                    onDragLeave={() => setIsDragOverBig(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverBig(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        setBigKmlFile(e.dataTransfer.files[0]);
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
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Upload file polygon besar (multiple polygons)</p>
                    <input 
                      type="file" 
                      ref={bigInputRef}
                      accept=".kml,.kmz" 
                      onChange={(e) => e.target.files && setBigKmlFile(e.target.files[0])}
                      style={{ display: 'none' }} 
                    />
                    <div className="file-name">
                      {bigKmlFile ? bigKmlFile.name : 'Belum ada file dipilih'}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <div className="button-separator">
              <button type="submit" className="btn-block" disabled={isProcessing}>
                {isProcessing ? 'Memproses...' : 'Proses & Generate CSV'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default PolygonInPolygon;