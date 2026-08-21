import { useState } from "react";
import MainLayout from "../components/MainLayout";

export default function LinkBudget() {
  // 1. DEKLARASI STATE
  const [feeder, setFeeder] = useState<string>("");
  const [distribusi, setDistribusi] = useState<string>("");
  const [feederError, setFeederError] = useState<boolean>(false);
  const [distribusiError, setDistribusiError] = useState<boolean>(false);

  const [sp1x2, setSp1x2] = useState<string>("");
  const [sp1x4, setSp1x4] = useState<string>("");
  const [sp1x8, setSp1x8] = useState<string>("");
  const [sp1x16, setSp1x16] = useState<string>("");
  const [sp1x32, setSp1x32] = useState<string>("");

  const [splicingFeeder, setSplicingFeeder] = useState<string>("");
  const [splicingDistribusi, setSplicingDistribusi] = useState<string>("");
  const [konektor, setKonektor] = useState<string>("");
  const [combiner, setCombiner] = useState<string>("");
  
  const [totalRedaman, setTotalRedaman] = useState<string>("0.00");

  // --- HANDLER INPUT ---
  const handleFeederChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.,]/g, "");
    setFeeder(val);
    setFeederError(val.includes(","));
  };

  const handleDistribusiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.,]/g, "");
    setDistribusi(val);
    setDistribusiError(val.includes(","));
  };

  const handleOnlyNumbers = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setter(e.target.value.replace(/[^0-9]/g, ""));
  };

  // 2. FUNGSI RUMUS MATEMATIKA
  const hitungTotal = () => {
    const redamanFeeder = (Number(feeder) || 0) * 0.35;
    const redamanDistribusi = (Number(distribusi) || 0) * 0.35;
    const redamanSplicingF = (Number(splicingFeeder) || 0) * 0.1;
    const redamanSplicingD = (Number(splicingDistribusi) || 0) * 0.1;
    const redamanKonektor = (Number(konektor) || 0) * 0.25;
    const redamanCombiner = (Number(combiner) || 0) * 1;
    
    const redamanSplitter = 
      (Number(sp1x2) || 0) * 4.2 +
      (Number(sp1x4) || 0) * 7.8 +
      (Number(sp1x8) || 0) * 11.4 +
      (Number(sp1x16) || 0) * 15 +
      (Number(sp1x32) || 0) * 18.6;

    const hasil = redamanFeeder + redamanDistribusi + redamanSplicingF + redamanSplicingD + redamanKonektor + redamanCombiner + redamanSplitter;
    
    // --- TRIK MEMOTONG 4 ANGKA DESIMAL TANPA PEMBULATAN ---
    let hasilString = hasil.toString();
    
    // Cek apakah angkanya memiliki desimal (mengandung titik)
    if (hasilString.includes(".")) {
      const parts = hasilString.split(".");
      // Pastikan ada 4 digit nol jika kurang, lalu potong paksa persis di 4 karakter
      const decimalPart = parts[1].padEnd(4, "0").substring(0, 4);
      hasilString = `${parts[0]}.${decimalPart}`;
    } else {
      // Jika hasil perhitungan bulat murni (misal: 28), tambahkan .0000 di belakangnya
      hasilString = `${hasilString}.0000`;
    }

    setTotalRedaman(hasilString);
  };

  // Gaya standar untuk kotak input di dalam tabel agar kodenya tidak kepanjangan
  const inputClass = "w-full p-2 bg-gray-50 border border-gray-200 rounded-md outline-none focus:bg-white focus:border-red-400 focus:ring-1 focus:ring-red-400 text-center transition-all";

  return (
    <MainLayout pageTitle="Link Budget" activeMenu="link-budget">
      <div className="p-8 min-h-screen bg-[#F4F6F8]">
        
        {/* WADAH TABEL: Diberi sudut melengkung dan bayangan halus */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-700">
              
              {/* HEADER TABEL */}
              <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-4 px-4 text-center w-12">No</th>
                  <th className="py-4 px-4">Uraian</th>
                  <th className="py-4 px-4 text-center w-24">Satuan</th>
                  <th className="py-4 px-4 text-center w-40">Volume</th>
                </tr>
              </thead>
              
              {/* ISI TABEL: Menggunakan divide-y agar ada garis tipis antar baris otomatis */}
              <tbody className="divide-y divide-gray-100">
                
                {/* 1. Kabel Feeder */}
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4 text-center font-medium text-gray-400">1</td>
                  <td className="py-3 px-4 text-gray-800 font-medium">Kabel Feeder</td>
                  <td className="py-3 px-4 text-center text-gray-500">Km</td>
                  <td className="py-3 px-4">
                    <input type="text" value={feeder} onChange={handleFeederChange} placeholder="0" className={`${inputClass} ${feederError ? "border-red-400 bg-red-50 text-red-600" : ""}`} />
                  </td>
                </tr>

                {/* 2. Kabel Distribusi */}
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4 text-center font-medium text-gray-400">2</td>
                  <td className="py-3 px-4 text-gray-800 font-medium">Kabel Distribusi</td>
                  <td className="py-3 px-4 text-center text-gray-500">Km</td>
                  <td className="py-3 px-4">
                    <input type="text" value={distribusi} onChange={handleDistribusiChange} placeholder="0" className={`${inputClass} ${distribusiError ? "border-red-400 bg-red-50 text-red-600" : ""}`} />
                  </td>
                </tr>

                {/* 3. SPLITTER (Rowspan 5) */}
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4 text-center font-medium text-gray-400" rowSpan={5}>3</td>
                  <td className="py-3 px-4"><span className="font-semibold text-gray-700">Splitter</span> <span className="text-gray-500">1:02 (4.2 dB)</span></td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={sp1x2} onChange={(e) => handleOnlyNumbers(e, setSp1x2)} placeholder="0" className={inputClass} />
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4"><span className="font-semibold text-gray-700">Splitter</span> <span className="text-gray-500">1:04 (7.8 dB)</span></td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={sp1x4} onChange={(e) => handleOnlyNumbers(e, setSp1x4)} placeholder="0" className={inputClass} />
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4"><span className="font-semibold text-gray-700">Splitter</span> <span className="text-gray-500">1:08 (11.4 dB)</span></td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={sp1x8} onChange={(e) => handleOnlyNumbers(e, setSp1x8)} placeholder="0" className={inputClass} />
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4"><span className="font-semibold text-gray-700">Splitter</span> <span className="text-gray-500">1:16 (15.0 dB)</span></td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={sp1x16} onChange={(e) => handleOnlyNumbers(e, setSp1x16)} placeholder="0" className={inputClass} />
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4"><span className="font-semibold text-gray-700">Splitter</span> <span className="text-gray-500">1:32 (18.6 dB)</span></td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={sp1x32} onChange={(e) => handleOnlyNumbers(e, setSp1x32)} placeholder="0" className={inputClass} />
                  </td>
                </tr>

                {/* 4. Konektor */}
                <tr className="hover:bg-gray-50/50 transition-colors border-t border-gray-100">
                  <td className="py-3 px-4 text-center font-medium text-gray-400">4</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-800">Konektor</span>
                      <select className="border border-gray-200 bg-gray-50 rounded-md p-1.5 text-xs outline-none cursor-pointer focus:border-red-400">
                        <option value="sc-upc">SC/UPC</option>
                        <option value="sc-apc">SC/APC</option>
                      </select>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={konektor} onChange={(e) => handleOnlyNumbers(e, setKonektor)} placeholder="0" className={inputClass} />
                  </td>
                </tr>

                {/* 5. Splicing (Rowspan 2) */}
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4 text-center font-medium text-gray-400" rowSpan={2}>5</td>
                  <td className="py-3 px-4"><span className="font-medium text-gray-800">Splicing</span> <span className="text-gray-500">(Kabel Feeder : 1 spl / 3km)</span></td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={splicingFeeder} onChange={(e) => handleOnlyNumbers(e, setSplicingFeeder)} placeholder="0" className={inputClass} />
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4"><span className="font-medium text-gray-800">Splicing</span> <span className="text-gray-500">(Kabel Distribusi : 1 spl / 3km)</span></td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={splicingDistribusi} onChange={(e) => handleOnlyNumbers(e, setSplicingDistribusi)} placeholder="0" className={inputClass} />
                  </td>
                </tr>

                {/* 6. Other / Combiner */}
                <tr className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4 text-center font-medium text-gray-400">6</td>
                  <td className="py-3 px-4 font-medium text-gray-800">Other <span className="text-gray-500 font-normal">(Combiner / DWDM)</span></td>
                  <td className="py-3 px-4 text-center text-gray-500">bh</td>
                  <td className="py-3 px-4">
                    <input type="text" value={combiner} onChange={(e) => handleOnlyNumbers(e, setCombiner)} placeholder="0" className={inputClass} />
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

          {/* AREA KALKULASI & HASIL (Menyatu di bagian bawah tabel) */}
          <div className="bg-gray-50 border-t border-gray-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <button 
              onClick={hitungTotal} 
              className="w-full md:w-auto bg-[#ED1E28] font-semibold text-white px-8 py-3 rounded-lg hover:bg-red-700 transition-all shadow-md flex items-center justify-center gap-2"
            >
              <span>Kalkulasi Total Redaman</span>
            </button>
            
            <div className="text-right">
              <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Total Keseluruhan Murni</p>
              <div className="flex items-baseline justify-end gap-2">
                <span className="text-4xl font-extrabold text-gray-900">{totalRedaman}</span>
                <span className="text-lg font-bold text-red-600">dB</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}