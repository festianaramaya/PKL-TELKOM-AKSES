import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/OdpForm.css';

interface OdcFormData {
  label: string;
  tipe: string;
  keterangan: string;
}

export const OdcForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const existingMarkers = location.state?.existingMarkers || [];
  const isTagging = location.state?.isTagging ?? true;

  const [formData, setFormData] = useState<OdcFormData>({
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
            type: 'ODC',
            label: formData.label || 'ODC Point',
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
    <MainLayout pageTitle="Tagging ODC" activeMenu="tagging">
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
                    Pilih ODC
                  </option>
                  <option value="ODC-C 288">ODC-C 288</option>
                  <option value="ODC-C 144">ODC-C 144</option>
                  <option value="ODC-B 48">ODC-B 48</option>
                  <option value="Mini OLT">Mini OLT</option>
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

export default OdcForm;