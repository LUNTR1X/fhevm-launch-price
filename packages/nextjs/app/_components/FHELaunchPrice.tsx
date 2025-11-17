"use client";

import { useEffect, useMemo, useState } from "react";
import { useFhevm } from "@fhevm-sdk";
import { AnimatePresence, motion } from "framer-motion";
import SquareLoader from "react-spinners/SquareLoader";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/helper/RainbowKitCustomConnectButton";
import { useLaunchPrice } from "~~/hooks/useLaunchPrice";

import dynamic from "next/dynamic";
const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const MOCK_CHAIN_ID_SEPOLIA = 11155111;
const ALCHEMY_URL = `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`;
const INITIAL_MOCK_CHAINS = { [MOCK_CHAIN_ID_SEPOLIA]: ALCHEMY_URL };

export const FHELaunchPrice = () => {
  const { isConnected, chain } = useAccount();
  const chainId = chain?.id;

  const provider = useMemo(() => (typeof window !== "undefined" ? (window as any).ethereum : undefined), []);

  const { instance: fhevmInstance } = useFhevm({
    provider,
    chainId,
    initialMockChains: INITIAL_MOCK_CHAINS,
    enabled: true,
  });

  const launchPrice = useLaunchPrice({ instance: fhevmInstance, mockChains: INITIAL_MOCK_CHAINS });

  const [predictedPrice, setPredictedPrice] = useState<number | null>(null);
  const [submittedPrice, setSubmittedPrice] = useState<number | null>(null);

  useEffect(() => {
    if (launchPrice.valueDecrypted && launchPrice.clearValue) {
      const val = Number(launchPrice.clearValue);
      setPredictedPrice(val);
      setSubmittedPrice(val);
    }
  }, [launchPrice.valueDecrypted, launchPrice.clearValue]);

  const handleSubmit = async () => {
    if (!predictedPrice || launchPrice.busy || launchPrice.isDecrypting) return;
    try {
      await launchPrice.submitValue("ZamaLaunch", predictedPrice);
      setSubmittedPrice(predictedPrice);
    } catch (err) {
      console.error("Failed to submit price:", err);
    }
  };

  const candleSeries = useMemo(() => {
    const price = launchPrice.valueDecrypted ? Number(launchPrice.clearValue) : submittedPrice;
    if (price === null || price === undefined) return [];
    const candle = { x: new Date(), y: [0, price, 0, price] };
    return [
      {
        name: "Your Prediction",
        type: "candlestick" as const,
        data: [candle],
        color: "#ff6ec7",
      },
    ];
  }, [submittedPrice, launchPrice.valueDecrypted, launchPrice.clearValue]);

  const candleOptions = useMemo(
    () => ({
      chart: {
        type: "candlestick",
        height: 400,
        toolbar: { show: true, tools: { download: true, zoom: true } },
        background: "#1a1a1a",
      },
      title: {
        text: "Zama Launch Price Prediction",
        align: "center",
        style: { color: "#e0e0e0", fontSize: "22px", fontWeight: "bold" },
      },
      xaxis: { type: "datetime", labels: { style: { colors: "#e0e0e0" } } },
      yaxis: { labels: { style: { colors: "#e0e0e0" } } },
      tooltip: {
        enabled: true,
        theme: "dark",
        y: { formatter: (val: number) => `$${val.toFixed(2)}` },
      },
      theme: { mode: "dark" as const, palette: "palette1" },
    }),
    [],
  );

  function onReload() {
    window && window.location.reload()
  }

  if (!isConnected) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] w-full items-center justify-center p-4">
        <motion.div className="bg-[#ffffff] border border-gray-800 shadow-2xl rounded-2xl p-12 max-w-md text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-3xl font-bold mb-3 text-[#55555]">Wallet Not Connected</h2>
          <p className="text-gray-400 mb-8">
            Connect your wallet to submit your encrypted launch price prediction for Zama.
          </p>
          <RainbowKitCustomConnectButton />
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div className="relative w-full min-h-[calc(100vh-60px)] text-gray-200 flex flex-col items-center justify-start py-12 px-6">
      {(launchPrice.busy || launchPrice.isDecrypting) && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 backdrop-blur-sm">
          <SquareLoader color="#1db954" size={45} />
        </div>
      )}

      <motion.div className="flex flex-col items-center w-full max-w-5xl space-y-8">
        <h1 className="text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-[#1db954] to-[#00aaff] bg-clip-text text-transparent drop-shadow-2xl">
          FHE Launch Price
        </h1>
        <p className="text-gray-300 text-lg text-center max-w-3xl">
          Predict Zama's initial listing price. Submit your encrypted value, then decrypt to see your prediction
          visualized on the candlestick chart.
        </p>

        <div className="w-[900px] bg-[#1a1a1a] rounded-2xl p-6 shadow-lg">
          <ReactApexChart options={candleOptions} series={candleSeries} type="candlestick" height={420} width={800} />
        </div>

        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4 w-full justify-center">
          <input
            placeholder="Enter your launch price"
            value={predictedPrice ?? ""}
            onChange={e => {
              const value = e.target.value;
              setPredictedPrice(/^\d*\.?\d*$/.test(value) ? Number(value) : null);
            }}
            className="w-64 px-5 py-3 rounded-xl bg-[#1a1a1a] text-[#e0e0e0] border border-gray-700 focus:outline-none focus:border-[#1db954] shadow-inner"
          />
          <button
            disabled={!predictedPrice || launchPrice.busy || launchPrice.isDecrypting}
            onClick={handleSubmit}
            className="px-5 py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md bg-[#1db954] hover:bg-[#17a74a]"
          >
            {launchPrice.busy ? "⏳ Submitting..." : "✅ Submit Price"}
          </button>
          <button
            disabled={!launchPrice.canDecrypt || launchPrice.isDecrypting || launchPrice.busy}
            onClick={launchPrice.decryptMyValue}
            className="px-5 py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md bg-[#00aaff] hover:bg-[#008fcc]"
          >
            {launchPrice.isDecrypting ? "⏳ Decrypting..." : "🔓 Decrypt Value"}
          </button>
          <button
            onClick={onReload}
            className="px-5 py-3 rounded-xl font-semibold text-white transition-all duration-200 shadow-md bg-gray-600 hover:bg-gray-700"
          >
            🔄 Refresh Page
          </button>
        </div>

        {launchPrice.status && (
          <AnimatePresence>
            <motion.div
              className="w-full p-4 bg-[#2a2a2a] text-[#ffc107] rounded-xl shadow-lg text-center font-medium"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              {launchPrice.status}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
};
