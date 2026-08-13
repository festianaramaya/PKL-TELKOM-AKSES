import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/TaggingShare.css';

export const TaggingShare: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Menerima nama file dan ukuran file dari halaman SaveTagging / State Peta
  const fileName = location.state?.fileName || 'Hasil_Tagging.kml';
  const fileSize = location.state?.fileSize || '0 KB'; // Dinamis sesuai hasil file

  const handleKembaliKeTagging = () => {
    navigate('/tagging');
  };

  return (
    <MainLayout pageTitle="Tagging Share" activeMenu="tagging">
      <div className="tagging-share-page">
        <div className="share-card-success">
          <div className="success-icon-wrapper">
            <img
              src="/images/check.png"
              alt="Success Check"
              className="check-icon-img"
            />
          </div>

          <h2 className="success-title">Tagging berhasil diselesaikan!</h2>
          <p className="success-subtitle">
            File hasil tagging telah berhasil dibuat dan siap dibagikan.
          </p>

          <div className="file-info-badge">
            <img
              src="/images/kml.png"
              alt="KML File"
              className="kml-badge-img"
            />
            <div className="file-info-text">
              <span className="file-name-text">{fileName}</span>
              {/* Ukuran file sekarang mengikuti data yang dikirim */}
              <span className="file-size-text">Ukuran file: {fileSize}</span>
            </div>
          </div>

          <div className="social-share-section">
            <span className="social-share-label">Dibagikan melalui:</span>
            <div className="social-icons-grid">
              <div className="social-item">
                <img src="/images/whatsapp.png" alt="WhatsApp" className="social-icon-img" />
                <span>WhatsApp</span>
              </div>
              <div className="social-item">
                <img src="/images/telegram.png" alt="Telegram" className="social-icon-img" />
                <span>Telegram</span>
              </div>
              <div className="social-item">
                <img src="/images/gmail.png" alt="Email" className="social-icon-img" />
                <span>Email</span>
              </div>
              <div className="social-item">
                <img src="/images/google-drive.png" alt="Google Drive" className="social-icon-img" />
                <span>Google Drive</span>
              </div>
              <div className="social-item">
                <img src="/images/facebook.png" alt="Facebook" className="social-icon-img" />
                <span>Facebook</span>
              </div>
              <div className="social-item">
                <img src="/images/option.png" alt="Lainnya" className="social-icon-img" />
                <span>Lainnya</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn-kembali-tagging"
            onClick={handleKembaliKeTagging}
          >
            Kembali
          </button>
        </div>
      </div>
    </MainLayout>
  );
};

export default TaggingShare;