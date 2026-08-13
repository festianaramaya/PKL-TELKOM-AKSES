import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/TaggingShare.css';

interface TaggingMarkerData {
  id: string;
  lat: number;
  lng: number;
  type: string;
  label?: string;
  keterangan?: string;
}

interface LocationState {
  fileName?: string;
  fileSize?: string;
  fileUrl?: string;
  markers?: TaggingMarkerData[];
}

export const TaggingShare: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as LocationState | null;
  const fileName = state?.fileName || 'Hasil_Tagging.kml';
  const fileSize = state?.fileSize || '15.4 KB';
  const fileUrl = state?.fileUrl;
  const markers = state?.markers || [];

  // Helper untuk membuat file KML sungguhan
  const getKmlFile = (): File => {
    const placemarksXml = markers
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
    <name>${fileName}</name>
    ${placemarksXml}
  </Document>
</kml>`;

    const blob = new Blob([kmlContent], {
      type: 'application/vnd.google-earth.kml+xml',
    });

    return new File([blob], fileName, {
      type: 'application/vnd.google-earth.kml+xml',
    });
  };

  // Unduh File KML
  const handleDownloadKml = () => {
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Handler Share Spesifik per Platform
  const handleShareApp = async (platform: string) => {
    const kmlFile = getKmlFile();

    // 1. Jika di Perangkat Mobile (HP) & Mendukung Native Share File
    if (navigator.canShare && navigator.canShare({ files: [kmlFile] })) {
      try {
        await navigator.share({
          files: [kmlFile],
          title: fileName,
          text: `Berikut file hasil tagging: ${fileName}`,
        });
        return;
      } catch (err) {
        console.log('Share dibatalkan');
        return;
      }
    }

    // 2. Jika di PC / Desktop (Otomatis Unduh File KML + Buka Aplikasi Tujuan)
    handleDownloadKml();

    const textMsg = encodeURIComponent(`Berikut adalah file hasil tagging: ${fileName}`);

    switch (platform) {
      case 'whatsapp':
        window.open(`https://web.whatsapp.com/`, '_blank');
        break;
      case 'telegram':
        window.open(`https://web.telegram.org/`, '_blank');
        break;
      case 'email':
        window.location.href = `mailto:?subject=${encodeURIComponent(`Hasil Tagging - ${fileName}`)}&body=${textMsg}`;
        break;
      case 'drive':
        window.open(`https://drive.google.com/`, '_blank');
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/`, '_blank');
        break;
      default:
        break;
    }
  };

  const handleKembaliKeTagging = () => {
    navigate('/tagging', {
      state: {
        markers: markers,
        isTagging: false,
      },
    });
  };

  return (
    <MainLayout pageTitle="Tagging SHARE" activeMenu="tagging">
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

          <div
            className="file-info-badge"
            onClick={handleDownloadKml}
            style={{ cursor: 'pointer' }}
            title="Klik untuk mengunduh file KML"
          >
            <img
              src="/images/kml.png"
              alt="KML File"
              className="kml-badge-img"
            />
            <div className="file-info-text">
              <span className="file-name-text">{fileName}</span>
              <span className="file-size-text">Ukuran file: {fileSize}</span>
            </div>
          </div>

          <div className="social-share-section">
            <span className="social-share-label">Dibagikan melalui:</span>
            <div className="social-icons-grid">
              <div
                className="social-item"
                onClick={() => handleShareApp('whatsapp')}
                style={{ cursor: 'pointer' }}
              >
                <img src="/images/whatsapp.png" alt="WhatsApp" className="social-icon-img" />
                <span>WhatsApp</span>
              </div>
              <div
                className="social-item"
                onClick={() => handleShareApp('telegram')}
                style={{ cursor: 'pointer' }}
              >
                <img src="/images/telegram.png" alt="Telegram" className="social-icon-img" />
                <span>Telegram</span>
              </div>
              <div
                className="social-item"
                onClick={() => handleShareApp('email')}
                style={{ cursor: 'pointer' }}
              >
                <img src="/images/gmail.png" alt="Email" className="social-icon-img" />
                <span>Email</span>
              </div>
              <div
                className="social-item"
                onClick={() => handleShareApp('drive')}
                style={{ cursor: 'pointer' }}
              >
                <img src="/images/google-drive.png" alt="Google Drive" className="social-icon-img" />
                <span>Google Drive</span>
              </div>
              <div
                className="social-item"
                onClick={() => handleShareApp('facebook')}
                style={{ cursor: 'pointer' }}
              >
                <img src="/images/facebook.png" alt="Facebook" className="social-icon-img" />
                <span>Facebook</span>
              </div>
              <div
                className="social-item"
                onClick={() => handleShareApp('native')}
                style={{ cursor: 'pointer' }}
              >
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