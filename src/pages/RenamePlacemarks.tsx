import React, { useState, useRef } from 'react';
import MainLayout from '../components/MainLayout';
import '../assets/RenamePlacemarks.css'; 

const RenamePlacemarks: React.FC = () => {
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [labelType, setLabelType] = useState<string>('numeric');
  const [numericPrefix, setNumericPrefix] = useState<string>('Lokasi');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [numberingType, setNumberingType] = useState<string>('sequential');
  const [customName, setCustomName] = useState<string>('Lokasi {n}');
  
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
      formData.append('labelType', labelType);
      formData.append('numericPrefix', numericPrefix);
      formData.append('startNumber', startNumber.toString());
      formData.append('numbering', numberingType);
      formData.append('customName', customName);

      const response = await fetch('/api/rename-placemarks', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Gagal memproses data.');
      }

      const disposition = response.headers.get('Content-Disposition');
      let filename = 'renamed_placemarks.kml';
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

      alert("File berhasil direname dan diunduh!");
    } catch (error: any) {
      alert("Terjadi kesalahan: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MainLayout pageTitle="Rename Placemarks" activeMenu="rename-placemarks">
      <div className="card">
        
    

        <div className="card-body">
          <form onSubmit={handleGenerate}>
            
            {/* Area Upload */}
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

            {/* Pilihan Tipe Penamaan */}
            <div className="form-group">
              <label className="form-label">Tipe Penamaan <span style={{color: '#EF4444'}}>*</span></label>
              <select 
                className="form-control" 
                value={labelType} 
                onChange={(e) => setLabelType(e.target.value)}
              >
                <option value="numeric">Numerik</option>
                <option value="custom">Kustom</option>
              </select>
            </div>

            {/* Input Dinamis berdasarkan Tipe Penamaan */}
            {labelType === 'numeric' ? (
              <>
                <div className="form-group">
                  <label className="form-label">Prefix</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={numericPrefix}
                    onChange={(e) => setNumericPrefix(e.target.value)}
                    placeholder="Contoh: Lokasi" 
                  />
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Nomor Awal</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={startNumber}
                      onChange={(e) => setStartNumber(Number(e.target.value))}
                      min="1" 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Jenis Penomoran</label>
                    <select 
                      className="form-control" 
                      value={numberingType}
                      onChange={(e) => setNumberingType(e.target.value)}
                    >
                      <option value="sequential">Berurutan</option>
                      <option value="random">Acak</option>
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">Format Nama Kustom</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Gunakan {n} untuk nomor urut" 
                />
              </div>
            )}

            <div className="button-separator">
              <button type="submit" className="btn-block" disabled={isProcessing}>
                {isProcessing ? 'Memproses...' : 'Rename & Download'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default RenamePlacemarks;