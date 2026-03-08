// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ChallengeHub - Crypto-Native Challenge Platform
 * ════════════════════════════════════════════════
 * 
 * Én smart contract som holder alle challenges.
 * Truth og penger er on-chain - DB brukes kun for UI/caching.
 * 
 * FEATURES:
 * • 2% global fee på alle paid challenges (går til feeRecipient)
 * • To-fase: Open → Locked → Settled/Refunded
 * • Outcome kan kun settes én gang
 * • Refund-logikk ved cancel/timeout
 * • Supports multiple challenge types (coinflip, sports betting, etc.)
 * 
 * ⚠️ AUDIT PÅKREVD før produksjon
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ChallengeHub {
    // ═══════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════

    address public owner;
    address public feeRecipient;
    IERC20 public immutable usdc;
    bool private locked; // ReentrancyGuard

    uint256 public constant FEE_PERCENT = 2;        // 2% fee
    uint256 public constant MAX_FEE_PERCENT = 10;   // Safety cap
    uint256 public constant REFUND_TIMEOUT = 7 days; // Auto-refund hvis ikke settled

    enum ChallengeStatus { Open, Locked, Settled, Refunded }
    enum ChallengeType { CoinFlip, SportsBet, CustomOracle }

    struct Challenge {
        uint256 id;
        ChallengeType challengeType;
        ChallengeStatus status;
        string name;
        string description;
        uint256 entryFee;           // USDC (6 decimals)
        uint256 maxPlayers;         // 2 for 1v1, more for multiplayer
        address creator;            // Who created this challenge
        uint256 createdAt;
        uint256 lockedAt;           // Timestamp når betting stenges
        uint256 settledAt;
        bytes32 outcome;            // keccak256("heads"), keccak256("tails"), etc.
        uint256 totalPot;           // Total USDC i potten (etter fee)
        uint256 totalFeeCollected;  // Total fee tatt (for transparency)
    }

    // CoinFlip specific data
    struct CoinFlipBet {
        uint256 amount;        // USDC amount (after fee)
        bool isHeads;          // true = heads, false = tails
        bool claimed;
    }

    mapping(uint256 => Challenge) public challenges;
    uint256 public challengeCount;

    // challengeId → user → bet
    mapping(uint256 => mapping(address => CoinFlipBet)) public coinFlipBets;
    
    // challengeId → choice → total amount (for pot calculation)
    mapping(uint256 => mapping(bool => uint256)) public coinFlipPots; // true=heads, false=tails
    
    // challengeId → participants list (for refunds/iteration)
    mapping(uint256 => address[]) public participants;
    
    // User deposited balances (internal accounting)
    mapping(address => uint256) public balances;

    // ═══════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════
    
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    event ChallengeCreated(
        uint256 indexed id,
        ChallengeType challengeType,
        string name,
        uint256 entryFee
    );
    
    event BetPlaced(
        uint256 indexed challengeId,
        address indexed user,
        uint256 amountAfterFee,
        uint256 feeAmount,
        bool isHeads
    );
    
    event ChallengeLocked(uint256 indexed challengeId, uint256 timestamp);
    
    event ChallengeSettled(
        uint256 indexed challengeId,
        bytes32 outcome,
        uint256 winnerCount,
        uint256 payoutPerWinner
    );
    
    event ChallengeRefunded(uint256 indexed challengeId, uint256 participantCount);
    
    event PrizeClaimed(
        uint256 indexed challengeId,
        address indexed user,
        uint256 amount
    );

    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    // ═══════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier noReentrancy() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    modifier challengeExists(uint256 id) {
        require(id > 0 && id <= challengeCount, "Challenge does not exist");
        _;
    }

    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════

    constructor(address _usdc, address _feeRecipient) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        
        owner = msg.sender;
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
    }

    // ═══════════════════════════════════════════════════════════════════
    // USER: DEPOSIT & WITHDRAWAL
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Deposit USDC into your internal balance
     * User must approve this contract first in USDC token
     * @param amount Amount of USDC to deposit (6 decimals)
     */
    function deposit(uint256 amount) external noReentrancy {
        require(amount > 0, "Amount must be > 0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from your internal balance
     * @param amount Amount of USDC to withdraw (6 decimals)
     */
    function withdraw(uint256 amount) external noReentrancy {
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Get user's internal balance
     * @param user User address
     */
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    // ═══════════════════════════════════════════════════════════════════
    // ADMIN: CREATE & MANAGE CHALLENGES
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Opprett et nytt coin flip challenge (1v1)
     * @param name Challenge navn
     * @param description Beskrivelse
     * @param entryFee Bet amount i USDC (begge spillere må matche)
     */
    function createCoinFlipChallenge(
        string calldata name,
        string calldata description,
        uint256 entryFee
    ) external returns (uint256) {
        require(entryFee > 0, "Entry fee must be > 0 for 1v1");
        
        challengeCount++;
        
        challenges[challengeCount] = Challenge({
            id: challengeCount,
            challengeType: ChallengeType.CoinFlip,
            status: ChallengeStatus.Open,
            name: name,
            description: description,
            entryFee: entryFee,
            maxPlayers: 2,  // 1v1 only
            creator: msg.sender,
            createdAt: block.timestamp,
            lockedAt: 0,
            settledAt: 0,
            outcome: bytes32(0),
            totalPot: 0,
            totalFeeCollected: 0
        });

        emit ChallengeCreated(challengeCount, ChallengeType.CoinFlip, name, entryFee);
        return challengeCount;
    }

    /**
     * @notice Lås challenge - ingen flere bets akseptert
     * @param challengeId Challenge ID
     */
    function lockChallenge(uint256 challengeId)
        external
        onlyOwner
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        require(c.status == ChallengeStatus.Open, "Challenge not open");
        
        c.status = ChallengeStatus.Locked;
        c.lockedAt = block.timestamp;
        
        emit ChallengeLocked(challengeId, block.timestamp);
    }

    /**
     * @notice Sett outcome og distribute prizes (kun én gang!)
     * @param challengeId Challenge ID
     * @param outcomeIsHeads true = heads wins, false = tails wins
     */
    function settleCoinFlip(uint256 challengeId, bool outcomeIsHeads)
        external
        onlyOwner
        noReentrancy
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        require(c.challengeType == ChallengeType.CoinFlip, "Not a coinflip");
        require(c.status == ChallengeStatus.Locked, "Must be locked first");
        require(c.outcome == bytes32(0), "Already settled");

        // Set outcome (immutable)
        c.outcome = outcomeIsHeads ? keccak256("heads") : keccak256("tails");
        c.status = ChallengeStatus.Settled;
        c.settledAt = block.timestamp;

        // Calculate winners and payout
        uint256 winningPot = coinFlipPots[challengeId][outcomeIsHeads];
        uint256 losingPot = coinFlipPots[challengeId][!outcomeIsHeads];
        
        // Hvis ingen vinnere, refunder alle
        if (winningPot == 0) {
            _refundAll(challengeId);
            return;
        }

        // Winners get their bet back + proportional share of losing pot
        uint256 totalPayout = winningPot + losingPot;
        
        emit ChallengeSettled(
            challengeId,
            c.outcome,
            _countWinners(challengeId, outcomeIsHeads),
            totalPayout
        );
    }

    /**
     * @notice Refund challenge (manuell eller ved timeout)
     * @param challengeId Challenge ID
     */
    function refundChallenge(uint256 challengeId)
        external
        noReentrancy
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        
        // Owner kan alltid refunde, eller anyone hvis timeout passert
        if (msg.sender != owner) {
            require(
                c.status == ChallengeStatus.Locked &&
                block.timestamp > c.lockedAt + REFUND_TIMEOUT,
                "Only owner or after timeout"
            );
        }
        
        require(c.status != ChallengeStatus.Settled, "Already settled");
        require(c.status != ChallengeStatus.Refunded, "Already refunded");

        _refundAll(challengeId);
    }

    // ═══════════════════════════════════════════════════════════════════
    // USER: PLACE BETS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Join coin flip challenge med bet (1v1 - må matche entryFee)
     * @param challengeId Challenge ID
     * @param isHeads true = bet på heads, false = bet på tails
     */
    function joinCoinFlip(uint256 challengeId, bool isHeads)
        external
        noReentrancy
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        require(c.challengeType == ChallengeType.CoinFlip, "Not a coinflip");
        require(c.status == ChallengeStatus.Open, "Betting closed");
        require(c.entryFee > 0, "Invalid entry fee");
        
        // Check if user already has a bet
        require(coinFlipBets[challengeId][msg.sender].amount == 0, "Already bet");
        
        // Check if challenge is full
        require(participants[challengeId].length < c.maxPlayers, "Challenge full");

        // Check internal balance
        require(balances[msg.sender] >= c.entryFee, "Insufficient balance");
        
        // Deduct from internal balance
        balances[msg.sender] -= c.entryFee;

        // Calculate fee
        uint256 feeAmount = (c.entryFee * FEE_PERCENT) / 100;
        uint256 amountAfterFee = c.entryFee - feeAmount;

        // Send fee to recipient
        if (feeAmount > 0) {
            require(usdc.transfer(feeRecipient, feeAmount), "Fee transfer failed");
        }

        // Record bet
        coinFlipBets[challengeId][msg.sender] = CoinFlipBet({
            amount: amountAfterFee,
            isHeads: isHeads,
            claimed: false
        });

        // Update pots
        coinFlipPots[challengeId][isHeads] += amountAfterFee;
        c.totalPot += amountAfterFee;
        c.totalFeeCollected += feeAmount;
        
        // Add to participants
        participants[challengeId].push(msg.sender);

        emit BetPlaced(challengeId, msg.sender, amountAfterFee, feeAmount, isHeads);
        
        // Auto-lock hvis challenge er full (1v1)
        if (participants[challengeId].length >= c.maxPlayers) {
            c.status = ChallengeStatus.Locked;
            c.lockedAt = block.timestamp;
            emit ChallengeLocked(challengeId, block.timestamp);
        }
    }

    /**
     * @notice Claim winnings etter settlement
     * @param challengeId Challenge ID
     */
    function claimPrize(uint256 challengeId)
        external
        noReentrancy
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        require(c.status == ChallengeStatus.Settled, "Not settled yet");
        
        CoinFlipBet storage bet = coinFlipBets[challengeId][msg.sender];
        require(bet.amount > 0, "No bet found");
        require(!bet.claimed, "Already claimed");

        // Check if winner
        bool isWinner = (c.outcome == keccak256("heads") && bet.isHeads) ||
                        (c.outcome == keccak256("tails") && !bet.isHeads);
        
        require(isWinner, "Not a winner");

        // Calculate payout
        uint256 winningPot = coinFlipPots[challengeId][bet.isHeads];
        uint256 losingPot = coinFlipPots[challengeId][!bet.isHeads];
        
        // Proportional share: (user bet / winning pot) * total pot
        uint256 payout = (bet.amount * (winningPot + losingPot)) / winningPot;
        
        bet.claimed = true;
        
        // Add to internal balance instead of direct transfer
        balances[msg.sender] += payout;
        
        emit PrizeClaimed(challengeId, msg.sender, payout);
    }

    /**
     * @notice Claim refund hvis challenge er refunded
     * @param challengeId Challenge ID
     */
    function claimRefund(uint256 challengeId)
        external
        noReentrancy
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        require(c.status == ChallengeStatus.Refunded, "Not refunded");
        
        CoinFlipBet storage bet = coinFlipBets[challengeId][msg.sender];
        require(bet.amount > 0, "No bet found");
        require(!bet.claimed, "Already claimed");

        uint256 refundAmount = bet.amount;
        bet.claimed = true;
        
        // Add to internal balance instead of direct transfer
        balances[msg.sender] += refundAmount;
        
        emit PrizeClaimed(challengeId, msg.sender, refundAmount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════

    function _refundAll(uint256 challengeId) internal {
        Challenge storage c = challenges[challengeId];
        c.status = ChallengeStatus.Refunded;
        
        emit ChallengeRefunded(challengeId, participants[challengeId].length);
    }

    function _countWinners(uint256 challengeId, bool outcomeIsHeads) internal view returns (uint256) {
        uint256 count = 0;
        address[] memory parts = participants[challengeId];
        
        for (uint256 i = 0; i < parts.length; i++) {
            if (coinFlipBets[challengeId][parts[i]].isHeads == outcomeIsHeads) {
                count++;
            }
        }
        
        return count;
    }

    // ═══════════════════════════════════════════════════════════════════
    // ADMIN: SETTINGS
    // ═══════════════════════════════════════════════════════════════════

    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid address");
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function getChallenge(uint256 id) external view returns (Challenge memory) {
        return challenges[id];
    }

    function getBet(uint256 challengeId, address user) 
        external 
        view 
        returns (CoinFlipBet memory) 
    {
        return coinFlipBets[challengeId][user];
    }

    function getParticipants(uint256 challengeId) 
        external 
        view 
        returns (address[] memory) 
    {
        return participants[challengeId];
    }

    function getPots(uint256 challengeId) 
        external 
        view 
        returns (uint256 headsPot, uint256 tailsPot) 
    {
        return (
            coinFlipPots[challengeId][true],
            coinFlipPots[challengeId][false]
        );
    }

    /**
     * @notice Calculate potential payout for a user if they win
     * @param challengeId Challenge ID
     * @param user User address
     */
    function calculatePotentialPayout(uint256 challengeId, address user)
        external
        view
        returns (uint256)
    {
        CoinFlipBet memory bet = coinFlipBets[challengeId][user];
        if (bet.amount == 0) return 0;

        uint256 winningPot = coinFlipPots[challengeId][bet.isHeads];
        uint256 losingPot = coinFlipPots[challengeId][!bet.isHeads];
        
        if (winningPot == 0) return 0;
        
        return (bet.amount * (winningPot + losingPot)) / winningPot;
    }
}
