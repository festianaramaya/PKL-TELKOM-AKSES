import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import '../../assets/Tagging/OdpForm.css';

interface HomepassFormData {
  noRumah: string;
  keterangan: string;
}

export const HomepassForm: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<HomepassFormData>({
    noRumah: '',
    keterangan: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Data Homepass Disimpan:", formData);
    navigate('/tagging');
  };

  const handleBatal = () => {
    navigate('/tagging');
  };

  return (
    <MainLayout pageTitle="Tagging Homepass" activeMenu="tagging">
      <div className="odp-container">
        <div className="odp-card">
          {/* Header Banner */}
          <div className="odp-header-banner">
            <div className="odp-icon-box">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="odp-header-title">HOMEPASS</span>
          </div>

          {/* Form Body */}
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
              >
                Batal
              </button>
              <button type="submit" className="btn-odp-simpan">
                Simpan
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default HomepassForm;