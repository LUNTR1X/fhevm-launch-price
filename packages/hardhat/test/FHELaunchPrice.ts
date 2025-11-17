import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FHELaunchPrice, FHELaunchPrice__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type ParticipantSigners = {
  owner: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
  dana: HardhatEthersSigner;
};

async function deployLaunchPrice() {
  const factory = (await ethers.getContractFactory("FHELaunchPrice")) as FHELaunchPrice__factory;
  const contract = (await factory.deploy()) as FHELaunchPrice;
  const addr = await contract.getAddress();
  return { contract, addr };
}

describe("FHELaunchPrice – Encrypted Price Predictions", function () {
  let signers: ParticipantSigners;
  let launchPrice: FHELaunchPrice;
  let contractAddr: string;

  before(async function () {
    const accounts = await ethers.getSigners();
    signers = { owner: accounts[0], charlie: accounts[1], dana: accounts[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    ({ contract: launchPrice, addr: contractAddr } = await deployLaunchPrice());
  });

  // --- Basic functionality ---
  it("initially no user has submitted a guess", async function () {
    expect(await launchPrice.hasSubmitted(signers.charlie.address)).to.eq(false);
    expect(await launchPrice.hasSubmitted(signers.dana.address)).to.eq(false);
  });

  it("permits a user to submit and update encrypted price guesses", async function () {
    const firstGuess = 2500;
    const secondGuess = 2700;

    // submit lần 1
    const enc1 = await fhevm.createEncryptedInput(contractAddr, signers.charlie.address).add32(firstGuess).encrypt();
    await (await launchPrice.connect(signers.charlie).submitPriceGuess(enc1.handles[0], enc1.inputProof)).wait();
    expect(await launchPrice.hasSubmitted(signers.charlie.address)).to.eq(true);

    let decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await launchPrice.encryptedGuessOf(signers.charlie.address),
      contractAddr,
      signers.charlie,
    );
    expect(decrypted).to.eq(firstGuess);

    // submit lần 2
    const enc2 = await fhevm.createEncryptedInput(contractAddr, signers.charlie.address).add32(secondGuess).encrypt();
    await (await launchPrice.connect(signers.charlie).submitPriceGuess(enc2.handles[0], enc2.inputProof)).wait();

    decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await launchPrice.encryptedGuessOf(signers.charlie.address),
      contractAddr,
      signers.charlie,
    );
    expect(decrypted).to.eq(secondGuess);
  });

  it("allows multiple participants to submit guesses independently", async function () {
    const charlieGuess = 3000;
    const danaGuess = 3200;

    const charlieEnc = await fhevm
      .createEncryptedInput(contractAddr, signers.charlie.address)
      .add32(charlieGuess)
      .encrypt();
    const danaEnc = await fhevm.createEncryptedInput(contractAddr, signers.dana.address).add32(danaGuess).encrypt();

    await (
      await launchPrice.connect(signers.charlie).submitPriceGuess(charlieEnc.handles[0], charlieEnc.inputProof)
    ).wait();
    await (await launchPrice.connect(signers.dana).submitPriceGuess(danaEnc.handles[0], danaEnc.inputProof)).wait();

    const charlieDec = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await launchPrice.encryptedGuessOf(signers.charlie.address),
      contractAddr,
      signers.charlie,
    );
    const danaDec = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await launchPrice.encryptedGuessOf(signers.dana.address),
      contractAddr,
      signers.dana,
    );

    expect(charlieDec).to.eq(charlieGuess);
    expect(danaDec).to.eq(danaGuess);
    expect(await launchPrice.hasSubmitted(signers.charlie.address)).to.eq(true);
    expect(await launchPrice.hasSubmitted(signers.dana.address)).to.eq(true);
  });

  it("enables granting decryption rights to another participant", async function () {
    const guessValue = 3500;
    const enc = await fhevm.createEncryptedInput(contractAddr, signers.charlie.address).add32(guessValue).encrypt();

    await (await launchPrice.connect(signers.charlie).submitPriceGuess(enc.handles[0], enc.inputProof)).wait();

    // Charlie cấp quyền cho Dana
    await launchPrice.connect(signers.charlie).allowDecryption(signers.dana.address);

    const danaDecrypted = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await launchPrice.encryptedGuessOf(signers.charlie.address),
      contractAddr,
      signers.dana,
    );

    expect(danaDecrypted).to.eq(guessValue);
  });

  // --- Edge / “chơi quá” cases ---
  it("rejects granting decryption if user has not submitted", async function () {
    await expect(launchPrice.connect(signers.charlie).allowDecryption(signers.dana.address)).to.be.revertedWith(
      "No guess submitted",
    );
  });

  it("handles extremely large guesses without overflow", async function () {
    const hugeGuess = 2 ** 32 - 1;
    const enc = await fhevm.createEncryptedInput(contractAddr, signers.charlie.address).add32(hugeGuess).encrypt();

    await (await launchPrice.connect(signers.charlie).submitPriceGuess(enc.handles[0], enc.inputProof)).wait();

    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await launchPrice.encryptedGuessOf(signers.charlie.address),
      contractAddr,
      signers.charlie,
    );
    expect(decrypted).to.eq(hugeGuess);
  });

  it("allows zero as a valid guess", async function () {
    const zeroGuess = 0;
    const enc = await fhevm.createEncryptedInput(contractAddr, signers.charlie.address).add32(zeroGuess).encrypt();

    await (await launchPrice.connect(signers.charlie).submitPriceGuess(enc.handles[0], enc.inputProof)).wait();

    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await launchPrice.encryptedGuessOf(signers.charlie.address),
      contractAddr,
      signers.charlie,
    );
    expect(decrypted).to.eq(zeroGuess);
  });

  it("permits rapid multiple updates", async function () {
    const guesses = [1000, 2000, 3000, 4000];
    for (const g of guesses) {
      const enc = await fhevm.createEncryptedInput(contractAddr, signers.charlie.address).add32(g).encrypt();
      await (await launchPrice.connect(signers.charlie).submitPriceGuess(enc.handles[0], enc.inputProof)).wait();
    }

    const finalValue = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await launchPrice.encryptedGuessOf(signers.charlie.address),
      contractAddr,
      signers.charlie,
    );
    expect(finalValue).to.eq(guesses[guesses.length - 1]);
  });
});
