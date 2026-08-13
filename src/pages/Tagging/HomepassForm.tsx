import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/OdpForm.css';

interface HomepassFormData {
  noRumah: string;
  keterangan: string;
}

export const HomepassForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const existingMarkers = location.state?.existingMarkers || [];
  const isTagging = location.state?.isTagging ?? true;

  const [formData, setFormData] = useState<HomepassFormData>({
    noRumah: '',
    keterangan: '',
  });

  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            type: 'HOMEPASS',
            label: formData.noRumah ? `No. ${formData.noRumah}` : 'Homepass Point',
            keterangan: formData.keterangan,
          };

          setIsLoadingLocation(false);

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
    navigate('/tagging', {
      state: { existingMarkers, isTagging },
    });
  };

  return (
    <MainLayout pageTitle="Tagging Homepass" activeMenu="tagging">
      <div className="odp-container">
        <div className="odp-card">
          <form onSubmit={handleSubmit} className="odp-form-body">
            {/* Field No Rumah */}
            <div className="odp-field-group">
              <label htmlFor="noRumah">No Rumah</label>
              <input
                type="text"
                id="noRumah"
                name="noRumah"
                placeholder="Text"
                value={formData.noRumah}
                onChange={handleChange}
                required
              />
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

export default HomepassForm;