// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHELaunchPrice
 * @notice Privacy-first dApp for predicting the initial listing price of a token.
 *         Users submit encrypted guesses; the contract stores only ciphertexts.
 * @dev Uses FHE to enable controlled decryption and verification.
 */
contract FHELaunchPrice is ZamaEthereumConfig {
    /// @dev Stores each user's encrypted price prediction
    mapping(address => euint32) private _encryptedGuesses;

    /// @dev Tracks whether a user has submitted at least once
    mapping(address => bool) private _hasSubmitted;

    /// @dev Timestamp of the user's latest guess
    mapping(address => uint256) private _lastGuessTime;

    /// @dev Event logging metadata of a guess submission
    event PriceGuessSubmitted(address indexed participant, uint256 timestamp);

    /// @notice Submit or update your encrypted launch price prediction
    /// @param encryptedGuess External FHE-encrypted integer
    /// @param zkProof Proof required by FHE.fromExternal
    function submitPriceGuess(externalEuint32 encryptedGuess, bytes calldata zkProof) external {
        euint32 internalEnc = FHE.fromExternal(encryptedGuess, zkProof);

        _encryptedGuesses[msg.sender] = internalEnc;
        _hasSubmitted[msg.sender] = true;
        _lastGuessTime[msg.sender] = block.timestamp;

        // Grant decryption permission to the predictor and the contract itself
        FHE.allow(_encryptedGuesses[msg.sender], msg.sender);
        FHE.allowThis(_encryptedGuesses[msg.sender]);

        emit PriceGuessSubmitted(msg.sender, block.timestamp);
    }

    /// @notice Check if a user has ever submitted a prediction
    function hasSubmitted(address user) external view returns (bool) {
        return _hasSubmitted[user];
    }

    /// @notice Retrieve the encrypted price guess of a user
    function encryptedGuessOf(address user) external view returns (euint32) {
        return _encryptedGuesses[user];
    }

    /// @notice Get timestamp of user's latest guess submission
    function lastGuessTimestamp(address user) external view returns (uint256) {
        return _lastGuessTime[user];
    }

    /// @notice Grant decryption rights of your guess to another address
    /// @param grantee Address to be allowed to decrypt your guess
    function allowDecryption(address grantee) external {
        require(_hasSubmitted[msg.sender], "No guess submitted");
        FHE.allow(_encryptedGuesses[msg.sender], grantee);
    }
}
