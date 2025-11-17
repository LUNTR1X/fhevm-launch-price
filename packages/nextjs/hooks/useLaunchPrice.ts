"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDeployedContractInfo } from "./helper";
import { useWagmiEthers } from "./wagmi/useWagmiEthers";
import { FhevmInstance } from "@fhevm-sdk";
import { buildParamsFromAbi, useFHEDecrypt, useFHEEncryption, useInMemoryStorage } from "@fhevm-sdk";
import { ethers } from "ethers";
import { useReadContract } from "wagmi";

interface UseLaunchPriceOptions {
  instance?: FhevmInstance;
  mockChains?: Record<number, string>;
}

export const useLaunchPrice = (options: UseLaunchPriceOptions) => {
  const { instance, mockChains } = options;
  const { storage: cache } = useInMemoryStorage();
  const { accounts, chainId, ethersSigner, ethersReadonlyProvider, isConnected } = useWagmiEthers(mockChains);

  const activeChain = typeof chainId === "number" ? chainId : undefined;

  const { data: contractInfo } = useDeployedContractInfo({
    contractName: "FHELaunchPrice",
    chainId: activeChain,
  });

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const hasContract = Boolean(contractInfo?.address && contractInfo?.abi);

  const getContract = (mode: "read" | "write") => {
    if (!hasContract) return undefined;
    const providerOrSigner = mode === "read" ? ethersReadonlyProvider : ethersSigner;
    if (!providerOrSigner) return undefined;
    return new ethers.Contract(contractInfo!.address, contractInfo!.abi, providerOrSigner);
  };

  // Fetch user's encrypted value
  const { data: rawValue, refetch: reloadValue } = useReadContract({
    address: hasContract ? contractInfo!.address : undefined,
    abi: hasContract ? contractInfo!.abi : undefined,
    functionName: "encryptedGuessOf",
    args: [accounts ? accounts[0] : ""],
    query: { enabled: hasContract && Boolean(ethersReadonlyProvider) },
  });

  const encryptedHandle = useMemo(() => rawValue as string | undefined, [rawValue]);

  const hasSubmitted = useMemo(() => {
    if (!encryptedHandle) return false;
    return encryptedHandle !== ethers.ZeroHash && encryptedHandle !== "0x0";
  }, [encryptedHandle]);

  const decryptParams = useMemo(() => {
    if (!hasSubmitted || !encryptedHandle || !contractInfo?.address) return undefined;
    return [{ handle: encryptedHandle, contractAddress: contractInfo.address }] as const;
  }, [encryptedHandle, hasSubmitted, contractInfo?.address]);

  const {
    canDecrypt,
    decrypt,
    results,
    isDecrypting,
    message: decryptMsg,
  } = useFHEDecrypt({
    instance,
    ethersSigner: ethersSigner as any,
    chainId,
    requests: decryptParams,
    fhevmDecryptionSignatureStorage: cache,
  });

  useEffect(() => {
    if (decryptMsg) setStatus(decryptMsg);
  }, [decryptMsg]);

  const clearValue = useMemo(() => {
    if (!encryptedHandle || !results) return undefined;
    const val = results[encryptedHandle];
    if (typeof val === "undefined") return undefined;
    return { handle: encryptedHandle, value: val } as const;
  }, [encryptedHandle, results]);

  const valueDecrypted = useMemo(() => {
    if (!encryptedHandle || !results) return false;
    const val = results[encryptedHandle];
    return typeof val !== "undefined" && BigInt(val) !== BigInt(0);
  }, [encryptedHandle, results]);

  const { encryptWith } = useFHEEncryption({
    instance,
    ethersSigner: ethersSigner as any,
    contractAddress: contractInfo?.address,
  });

  const submitValue = useCallback(
    async (label: string, amount: number) => {
      if (busy || !accounts?.[0] || !hasContract) return;
      setBusy(true);
      setStatus(`Encrypting ${amount} for ${label}...`);

      try {
        const encrypted = await encryptWith(builder => {
          (builder as any)["add32"](amount);
        });

        if (!encrypted) throw new Error("Encryption failed");

        const writeContract = getContract("write");
        if (!writeContract) throw new Error("Contract signer missing");

        const params = buildParamsFromAbi(encrypted, contractInfo!.abi, "submitPriceGuess");

        const tx = await writeContract.submitPriceGuess(...params, { gasLimit: 300_000 });
        setStatus("Waiting for blockchain confirmation...");
        await tx.wait();
        setStatus(`Value submitted for ${label}`);
        await reloadValue();
      } catch (err) {
        setStatus(`Submission error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [accounts, hasContract, contractInfo?.abi, encryptWith, busy, reloadValue],
  );

  useEffect(() => setStatus(""), [accounts, chainId]);

  return {
    contractAddress: contractInfo?.address,
    canDecrypt,
    decryptMyValue: decrypt,
    valueDecrypted,
    submitValue,
    clearValue: clearValue?.value,
    encryptedHandle,
    isDecrypting,
    status,
    hasSubmitted,
    accounts,
    chainId,
    isConnected,
    ethersSigner,
    reloadValue,
    busy,
  };
};
