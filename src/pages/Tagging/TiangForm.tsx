import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/OdpForm.css';

interface TiangFormData {
  tipe: string;
}

export const TiangForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const savedMarkers = sessionStorage.getItem('tagging_markers');
  const existingMarkers =
    location.state?.existingMarkers ||
    (savedMarkers ? JSON.parse(savedMarkers) : []);

  const [formData, setFormData] = useState<TiangFormData>({
    tipe: '',
  });

  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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
            type: 'TIANG',
            label: formData.tipe || 'Tiang Point',
          };

          setIsLoadingLocation(false);

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
    <MainLayout pageTitle="Tagging Tiang" activeMenu="tagging">
      <div className="odp-container">
        <div className="odp-card">
          <form onSubmit={handleSubmit} className="odp-form-body">
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
                    Pilih Tiang Eksisting
                  </option>
                  <option value="Tiang 7 Meter">Tiang 7 Meter</option>
                  <option value="Tiang 9 Meter">Tiang 9 Meter</option>
                  <option value="Tiang 12 Meter">Tiang 12 Meter</option>
                </select>
                <span className="custom-arrow">▼</span>
              </div>
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

export default TiangForm;