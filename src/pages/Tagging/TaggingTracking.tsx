import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MainLayout from "../../components/MainLayout";
import "../../assets/Tagging/TaggingTracking.css";

interface TaggingMarkerData {
  id: string;
  lat: number;
  lng: number;
  type: string;
  label?: string;
}

export const TaggingTracking: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  // Menerima data marker DINAMIS dari hasil tagging pengguna
  const markers: TaggingMarkerData[] = location.state?.markers || [];

  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletMapRef.current) return;

    // Koordinat pusat peta (default ke Surabaya jika marker kosong)
    const defaultCenter: L.LatLngTuple =
      markers.length > 0 ? [markers[0].lat, markers[0].lng] : [-7.3228, 112.7688];

    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: 14,
      zoomControl: true,
    });

    leafletMapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    if (markers.length > 0) {
      // 1. Gambar Garis Rute (Polyline) Menghubungkan Titik-Titik Hasil Tagging Asli
      const polylineCoords: L.LatLngTuple[] = markers.map((m) => [m.lat, m.lng]);

      L.polyline(polylineCoords, {
        color: "#0f172a",
        weight: 3.5,
        opacity: 0.9,
      }).addTo(map);

      // 2. Render Custom Pin Kapsul untuk Setiap Titik Hasil Tagging
      markers.forEach((item, index) => {
        const isStart = index === 0;
        const isStop = index === markers.length - 1;

        let iconSymbol = "⚪";
        if (item.type === "ODP") iconSymbol = "🗄️";
        if (item.type === "ODC") iconSymbol = "📦";
        if (item.type === "HOMEPASS") iconSymbol = "🏠";

        // SELALU TAMPILKAN LABEL TIPE (ODP/ODC/Tiang/Homepass)
        // Dan tambahkan badge START/STOP di atas kapsulnya
        const pinHtml = `
          <div class="figma-tracking-pin">
            ${isStart ? '<div class="badge-capsule start-capsule">START</div>' : ""}
            ${isStop ? '<div class="badge-capsule stop-capsule">STOP</div>' : ""}
            
            <div class="node-circle"></div>
            
            <div class="label-capsule">
              <span class="icon-span">${iconSymbol}</span>
              <span>${item.label || item.type}</span>
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          className: "leaflet-tracking-marker-container",
          html: pinHtml,
          iconSize: [120, 40],
          iconAnchor: [15, 20],
        });

        L.marker([item.lat, item.lng], { icon: customIcon }).addTo(map);
      });

      // Fokuskan Peta Otomatis Membungkus Seluruh Titik Tagging Pengguna
      const bounds = L.latLngBounds(polylineCoords);
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [markers]);

  return (
    <MainLayout pageTitle="Tagging TRACKING" activeMenu="tagging">
      <div className="tracking-page-container">
        {/* MAP CONTAINER DENGAN OVERLAY LEGEND */}
        <div className="tracking-map-card">
          <div ref={mapRef} className="tracking-leaflet-map" />

          {/* Legend Melayang di Kiri Bawah */}
          <div className="figma-map-legend">
            <div className="legend-row">
              <span className="legend-dot">⚪</span>
              <span>TIANG</span>
            </div>
            <div className="legend-row">
              <span className="legend-dot">🗄️</span>
              <span>ODP</span>
            </div>
            <div className="legend-row">
              <span className="legend-dot">📦</span>
              <span>ODC</span>
            </div>
            <div className="legend-row">
              <span className="legend-dot">🏠</span>
              <span>HOMEPASS</span>
            </div>
          </div>
        </div>

        {/* CONTROLS BAR */}
        <div className="tracking-bottom-controls">
          <button
            type="button"
            className="btn-start-tracking"
            onClick={() => navigate("/tagging")}
          >
            <span className="play-icon">▶</span> START
          </button>
          <button type="button" className="btn-stop-tracking" disabled>
            <span className="square-icon">□</span> STOP
          </button>
        </div>
      </div>
    </MainLayout>
  );
};

export default TaggingTracking;