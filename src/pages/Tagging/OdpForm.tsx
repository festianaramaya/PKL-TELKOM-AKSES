import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/OdpForm.css';

interface OdpFormData {
  label: string;
  tipe: string;
  keterangan: string;
}

export const OdpForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Ambil data existingMarkers dari state atau sessionStorage sebagai fallback jika di-back dari HP
  const savedMarkers = sessionStorage.getItem('tagging_markers');
  const existingMarkers =
    location.state?.existingMarkers ||
    (savedMarkers ? JSON.parse(savedMarkers) : []);

  const [formData, setFormData] = useState<OdpFormData>({
    label: '',
    tipe: '',
    keterangan: '',
  });

  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingLocation(true);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newMarker = {
            id: Date.now().toString(),
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            type: 'ODP',
            label: formData.label || 'ODP Point',
            keterangan: formData.keterangan,
          };

          setIsLoadingLocation(false);

          // Simpan update markers ke sessionStorage
          const updatedMarkers = [...existingMarkers, newMarker];
          sessionStorage.setItem('tagging_markers', JSON.stringify(updatedMarkers));
          sessionStorage.setItem('tagging_active', 'true');

          navigate('/tagging', {
            state: {
              newMarker,
              existingMarkers,
              isTagging: true,
            },
          });
        },
        (error) => {
          setIsLoadingLocation(false);
          alert('Gagal mengambil lokasi GPS asli: ' + error.message);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setIsLoadingLocation(false);
      alert('Browser Anda tidak mendukung Geolocation.');
    }
  };

  const handleBatal = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/tagging', {
        state: { existingMarkers, isTagging: true },
      });
    }
  };

  return (
    <MainLayout pageTitle="Tagging ODP" activeMenu="tagging">
      <div className="odp-container">
        <div className="odp-card">
          <form onSubmit={handleSubmit} className="odp-form-body">
            {/* Field Label */}
            <div className="odp-field-group">
              <label htmlFor="label">Label</label>
              <input
                type="text"
                id="label"
                name="label"
                placeholder="Text"
                value={formData.label}
                onChange={handleChange}
                required
              />
            </div>

            {/* Field Tipe */}
            <div className="odp-field-group">
              <label htmlFor="tipe">Tipe</label>
              <div className="select-wrapper">
                <select
                  id="tipe"
                  name="tipe"
                  value={formData.tipe}
                  onChange={handleChange}
                  className={!formData.tipe ? 'placeholder-selected' : ''}
                  required
                >
                  <option value="" disabled hidden>
                    Pilih ODP
                  </option>
                  <option value="ODP Solid 16">ODP Solid 16</option>
                  <option value="ODP Solid 8">ODP Solid 8</option>
                  <option value="ODP PB 16">ODP PB 16</option>
                  <option value="ODP PB 8">ODP PB 8</option>
                  <option value="ODP Closure">ODP Closure</option>
                </select>
                <span className="custom-arrow">▼</span>
              </div>
            </div>

            {/* Field Keterangan */}
            <div className="odp-field-group">
              <label htmlFor="keterangan">Keterangan</label>
              <input
                type="text"
                id="keterangan"
                name="keterangan"
                placeholder="Text"
                value={formData.keterangan}
                onChange={handleChange}
              />
            </div>

            {/* Form Actions */}
            <div className="odp-button-group">
              <button
                type="button"
                className="btn-odp-batal"
                onClick={handleBatal}
                disabled={isLoadingLocation}
              >
                Batal
              </button>
              <button 
                type="submit" 
                className="btn-odp-simpan"
                disabled={isLoadingLocation}
              >
                {isLoadingLocation ? 'Mengambil Lokasi...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default OdpForm;