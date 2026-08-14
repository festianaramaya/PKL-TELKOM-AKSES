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
  const markers = state?.markers || [];

  const getKmlFile = (): File => {
    // Definisi Style Icon KML (Google Earth: ODP & ODC berwarna Merah)
    const kmlStyles = `
      <Style id="icon-tiang">
        <IconStyle>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
          </Icon>
        </IconStyle>
      </Style>
      <Style id="icon-odp">
        <IconStyle>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
          </Icon>
        </IconStyle>
      </Style>
      <Style id="icon-odc">
        <IconStyle>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/shapes/triangle.png</href>
          </Icon>
          <color>ff0000ff</color> <!-- Mengatur Segitiga Menjadi Merah di Google Earth -->
        </IconStyle>
      </Style>
      <Style id="icon-homepass">
        <IconStyle>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png</href>
          </Icon>
        </IconStyle>
      </Style>
    `;

    const placemarksXml = markers
      .map((p) => {
        let styleId = 'icon-tiang';
        const currentType = p.type.toUpperCase();
        
        if (currentType === 'ODP') styleId = 'icon-odp';
        else if (currentType === 'ODC') styleId = 'icon-odc';
        else if (currentType === 'HOMEPASS') styleId = 'icon-homepass';

        return `
    <Placemark>
      <name>${p.label || p.type}</name>
      <styleUrl>#${styleId}</styleUrl>
      <description>Tipe: ${p.type}${p.keterangan ? ' - Ket: ' + p.keterangan : ''}</description>
      <Point>
        <coordinates>${p.lng},${p.lat},0</coordinates>
      </Point>
    </Placemark>`;
      })
      .join('');

    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${fileName}</name>
    ${kmlStyles}
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

  const handleDownloadKml = () => {
    const kmlFile = getKmlFile();
    const url = URL.createObjectURL(kmlFile);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  };

  const handleShareApp = async (platform: string) => {
    const kmlFile = getKmlFile();
    const textMsg = `Berikut adalah file hasil tagging: ${fileName}`;
    const fallbackText = encodeURIComponent(textMsg + '\n\n*(Sistem telah mengunduh file ini ke perangkat Anda. Tolong lampirkan/kirim file tersebut ke obrolan ini)*');

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile && navigator.canShare && navigator.canShare({ files: [kmlFile] })) {
      try {
        await navigator.share({
          files: [kmlFile],
          title: fileName,
          text: textMsg,
        });
        return; 
      } catch (err: any) {
        if (err.name === 'AbortError') return; 
        console.error('Share HP gagal:', err);
      }
    }

    if (platform !== 'native') {
       handleDownloadKml();
    }

    switch (platform) {
      case 'whatsapp':
        window.open(`https://wa.me/?text=${fallbackText}`, '_blank');
        break;
      case 'telegram':
        window.open(`https://t.me/share/url?url=&text=${fallbackText}`, '_blank');
        break;
      case 'email':
        window.location.href = `mailto:?subject=${encodeURIComponent(`Hasil Tagging - ${fileName}`)}&body=${fallbackText}`;
        break;
      case 'drive':
      case 'facebook':
      case 'native':
        alert(`File ${fileName} otomatis diunduh.\nSilakan buka aplikasi ${platform} lalu unggah file tersebut secara manual.`);
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
            <img src="/images/check.png" alt="Success Check" className="check-icon-img" />
          </div>

          <h2 className="success-title">Tagging berhasil diselesaikan!</h2>
          <p className="success-subtitle">
            File hasil tagging telah berhasil dibuat dan siap dibagikan.
          </p>

          <div
            className="file-info-badge"
            onClick={handleDownloadKml}
            style={{ cursor: 'pointer' }}
            title="Klik untuk mengunduh file KML secara manual"
          >
            <img src="/images/kml.png" alt="KML File" className="kml-badge-img" />
            <div className="file-info-text">
              <span className="file-name-text">{fileName}</span>
              <span className="file-size-text">Ukuran file: {fileSize}</span>
            </div>
          </div>

          <div className="social-share-section">
            <span className="social-share-label">Dibagikan melalui:</span>
            <div className="social-icons-grid">
              <div className="social-item" onClick={() => handleShareApp('whatsapp')} style={{ cursor: 'pointer' }}>
                <img src="/images/whatsapp.png" alt="WhatsApp" className="social-icon-img" />
                <span>WhatsApp</span>
              </div>
              <div className="social-item" onClick={() => handleShareApp('telegram')} style={{ cursor: 'pointer' }}>
                <img src="/images/telegram.png" alt="Telegram" className="social-icon-img" />
                <span>Telegram</span>
              </div>
              <div className="social-item" onClick={() => handleShareApp('email')} style={{ cursor: 'pointer' }}>
                <img src="/images/gmail.png" alt="Email" className="social-icon-img" />
                <span>Email</span>
              </div>
              <div className="social-item" onClick={() => handleShareApp('drive')} style={{ cursor: 'pointer' }}>
                <img src="/images/google-drive.png" alt="Google Drive" className="social-icon-img" />
                <span>Google Drive</span>
              </div>
              <div className="social-item" onClick={() => handleShareApp('facebook')} style={{ cursor: 'pointer' }}>
                <img src="/images/facebook.png" alt="Facebook" className="social-icon-img" />
                <span>Facebook</span>
              </div>
              <div className="social-item" onClick={() => handleShareApp('native')} style={{ cursor: 'pointer' }}>
                <img src="/images/option.png" alt="Lainnya" className="social-icon-img" />
                <span>Lainnya</span>
              </div>
            </div>
          </div>

          <button type="button" className="btn-kembali-tagging" onClick={handleKembaliKeTagging}>
            Kembali
          </button>
        </div>
      </div>
    </MainLayout>
  );
};

export default TaggingShare;