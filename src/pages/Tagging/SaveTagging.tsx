import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/SaveTagging.css';

export const SaveTagging: React.FC = () => {
  const navigate = useNavigate();
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

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

    // Pindah ke halaman TaggingShare sambil membawa nama file
    navigate('/tagging/share', { state: { fileName: cleanedName } });
  };

  return (
    <MainLayout pageTitle="Tagging Save" activeMenu="tagging">
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