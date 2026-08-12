import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MainLayout from "../components/MainLayout";// Pastikan path sesuaikan dengan lokasi MainLayout.tsx Anda

// Fix icon marker default Leaflet
const markerIconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const markerShadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: markerIconUrl,
    shadowUrl: markerShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

type ConversionType = 'dxf' | 'csv';

function MapEffect({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  }, [bounds, map]);
  return null;
}

export default function KmlToDxf() {
  const [files, setFiles] = useState<Record<ConversionType, File | null>>({ dxf: null, csv: null });
  const [status, setStatus] = useState<Record<ConversionType, { type: 'success' | 'error' | 'loading' | '', message: string }>>({
    dxf: { type: '', message: '' },
    csv: { type: '', message: '' }
  });
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [mapMarkers, setMapMarkers] = useState<{name: string, pos: L.LatLngTuple}[]>([]);
  const [mapPolylines, setMapPolylines] = useState<{name: string, positions: L.LatLngTuple[]}[]>([]);
  const [totalFeatures, setTotalFeatures] = useState<number>(0);
  
  // === TAMBAHAN STATE UNTUK DETEKSI HOVER MOUSE ===
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const handleFileChange = (type: ConversionType, file: File) => {
    if (!file.name.toLowerCase().endsWith('.kml')) {
      setStatus(prev => ({ ...prev, [type]: { type: 'error', message: '✕ Hanya KML' } }));
      return;
    }
    setFiles(prev => ({ ...prev, [type]: file }));
    setStatus(prev => ({ ...prev, [type]: { type: '', message: 'File siap dikonversi' } }));

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const placemarks = xmlDoc.getElementsByTagName("Placemark");
        setTotalFeatures(placemarks.length);

        const parsedMarkers: typeof mapMarkers = [];
        const parsedPolylines: typeof mapPolylines = [];
        const allPoints: L.LatLngTuple[] = [];

        for (let i = 0; i < placemarks.length; i++) {
          const pm = placemarks[i];
          const name = pm.getElementsByTagName("name")[0]?.textContent || "Feature";
          
          const pointNode = pm.getElementsByTagName("Point")[0];
          if (pointNode) {
            const coordNode = pointNode.getElementsByTagName("coordinates")[0];
            if (coordNode?.textContent) {
              const c = coordNode.textContent.trim().split(',');
              if (c.length >= 2) {
                const pt: L.LatLngTuple = [parseFloat(c[1]), parseFloat(c[0])];
                parsedMarkers.push({ name, pos: pt });
                allPoints.push(pt);
              }
            }
          }

          const lineNode = pm.getElementsByTagName("LineString")[0];
          if (lineNode) {
            const coordNode = lineNode.getElementsByTagName("coordinates")[0];
            if (coordNode?.textContent) {
              const raw = coordNode.textContent.trim().split(/\s+/);
              const positions: L.LatLngTuple[] = [];
              for (const r of raw) {
                const parts = r.split(',');
                if (parts.length >= 2) {
                  const pt: L.LatLngTuple = [parseFloat(parts[1]), parseFloat(parts[0])];
                  positions.push(pt);
                  allPoints.push(pt);
                }
              }
              if (positions.length > 0) parsedPolylines.push({ name, positions });
            }
          }
        }
        setMapMarkers(parsedMarkers);
        setMapPolylines(parsedPolylines);
        if (allPoints.length > 0) setBounds(L.latLngBounds(allPoints));
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  const handleConvert = async (type: ConversionType) => {
    const file = files[type];
    if (!file) return;

    setStatus(prev => ({ ...prev, [type]: { type: 'loading', message: 'MENGONVERSI...' } }));
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload_kml', { method: 'POST', body: formData });
      if (!response.ok) throw new Error();
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hasil_${file.name.replace(/\.kml$/i, '.dxf')}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      
      setStatus(prev => ({ ...prev, [type]: { type: 'success', message: 'Sukses!' } }));
    } catch {
      setStatus(prev => ({ ...prev, [type]: { type: 'error', message: 'Gagal' } }));
    }
  };

  return (
    <MainLayout pageTitle="KML to DXF" activeMenu="kml-to-dxf">
      <div style={{ background: 'transparent', borderRadius: '8px', boxShadow: 'none', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px', boxSizing: 'border-box', width: '100%' }}>
        
        {/* INPUT FILE / UPLOAD AREA */}
        <div>
          <div className="file-kml" style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="file-kml-span">File KML</span>
            <span style={{color: '#EF4444'}}>*</span>
          </div>

          <div 
            onClick={() => document.getElementById('file-dxf')?.click()}
            
            // === EVENT LISTENER UNTUK DETEKSI HOVER MOUSE ===
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            
            style={{ 
              cursor: 'pointer', 
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              textAlign: 'center',
              padding: '24px',
              minHeight: '180px',
              borderRadius: '6px',
              
              // === LOGIKA WARNA KOTAK BERUBAH OTOMATIS ===
              borderColor: files.dxf ? '#10b981' : (isHovered ? '#3175f2' : '#cbd5e1'),
              borderStyle: files.dxf ? 'solid' : 'dashed',
              borderWidth: '1.5px',
              backgroundColor: files.dxf 
                ? 'rgba(240, 253, 244, 0.7)' // Hijau transparan kalau ada file
                : isHovered 
                  ? 'rgba(239, 246, 255, 0.7)' // Biru transparan kalau mouse masuk
                  : 'rgba(255, 255, 255, 0.4)', // Putih transparan default
              
              
              boxSizing: 'border-box',
              transition: 'all 0.2s ease' // Transisi halus saat warna berubah
            }}
          >
            <input 
              type="file" 
              id="file-dxf" 
              accept=".kml" 
              style={{ display: 'none' }} 
              onChange={(e) => e.target.files?.[0] && handleFileChange('dxf', e.target.files[0])} 
            />
            
            {/* Cloud Icon */}
            {/* Ikon Upload (Tanda Panah) */}
            <svg 
              width="46" height="46" viewBox="0 0 24 24" fill="none" 
              
              /* === KUNCI: Hapus warna birunya, biarkan hitam (currentColor) atau hijau saat ada file === */
              stroke={files.dxf ? '#10b981' : 'currentColor'} 
              
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: 'stroke 0.2s ease' }}
            >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#1f2937' }}>
              Klik untuk memilih file atau drag &amp; drop di sini
            </div>
            
            <div style={{ 
                fontSize: '14px', 
                color: files.dxf ? '#0BA567' : '#6b7280',
                backgroundColor: files.dxf ? '#e6f6ef' : 'transparent',
                padding: files.dxf ? '6px 12px' : '0',
                borderRadius: '6px',
                fontWeight: files.dxf ? 'bold' : 'normal',
                maxWidth: '80%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {files.dxf ? `File siap: ${files.dxf.name}` : 'Belum ada file dipilih'}
            </div>
          </div>
        </div>

        {/* PREVIEW PETA LEAFLET */}
        <div>
          <div className="preview-lokasi-peta" style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
            Preview Lokasi (Peta) {totalFeatures > 0 && `(${totalFeatures} fitur)`}
          </div>
          
          <div style={{ height: '320px', width: '100%', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e5e7eb' }}>
            <MapContainer center={[-2.5489, 118.0149]} zoom={4} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapEffect bounds={bounds} />
              {mapMarkers.map((m, i) => (
                <Marker key={i} position={m.pos}>
                  <Popup>{m.name}</Popup>
                </Marker>
              ))}
              {mapPolylines.map((p, i) => (
                <Polyline key={i} positions={p.positions} color="#3182ce" weight={3}>
                  <Popup>{p.name}</Popup>
                </Polyline>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* TOMBOL KONVERSI */}
        <button
          onClick={() => handleConvert('dxf')}
          disabled={!files.dxf || status.dxf.type === 'loading'}
          style={{
            width: '100%',
            height: '42px',
            backgroundColor: files.dxf ? '#4d535e' : '#94a3b8',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '15px',
            border: 'none',
            borderRadius: '6px',
            cursor: files.dxf ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s'
          }}
        >
          {status.dxf.type === 'loading' ? 'MENGONVERSI...' : 'KONVERSI KE DXF'}
        </button>

        {/* PESAN STATUS */}
        {status.dxf.message && (
          <div style={{
            textAlign: 'center',
            fontWeight: 'bold',
            color: status.dxf.type === 'error' ? '#e53e3e' : status.dxf.type === 'success' ? '#0ba567' : '#3182ce'
          }}>
            {status.dxf.message}
          </div>
        )}

      </div>
      </div>
    </MainLayout>
  );
}