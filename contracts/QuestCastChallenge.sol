// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * QuestCast Challenge Contract
 * ─────────────────────────────
 * Brukere setter inn USDC og deltar i challenges.
 * Owner (QuestCast) oppretter challenges og setter betingelser.
 * Brukere kan ta ut ubrukt balanse når som helst.
 *
 * SIKKERHET: Bruk OpenZeppelin-biblioteker.
 * Deploy med: npx hardhat run scripts/deploy.js --network polygon
 *
 * ⚠️  AUDIT PÅKREVD før produksjon med ekte penger.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract QuestCastChallenge {
    // ─── State ───────────────────────────────────────────────────────────────

    address public owner;
    IERC20  public immutable usdc;
    bool    private locked; // ReentrancyGuard

    struct Challenge {
        uint256 id;
        string  name;
        string  description;
        uint256 entryFee;        // USDC, 6 desimaler (1 USDC = 1_000_000)
        uint256 goal;            // Antall deltakere som kreves
        uint256 deadline;        // Unix timestamp
        bool    active;
        uint256 participantCount;
        uint256 prizePool;       // Total USDC i potten
    }

    // challengeId → Challenge
    mapping(uint256 => Challenge) public challenges;
    uint256 public challengeCount;

    // bruker → USDC-balanse på kontrakten
    mapping(address => uint256) public balances;

    // challengeId → bruker → har deltatt
    mapping(uint256 => mapping(address => bool)) public hasJoined;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event ChallengeCreated(uint256 indexed id, string name, uint256 entryFee, uint256 goal, uint256 deadline);
    event ChallengeJoined(uint256 indexed challengeId, address indexed user);
    event ChallengeCompleted(uint256 indexed challengeId, address[] winners, uint256 prizePerWinner);

    // ─── Modifiers ───────────────────────────────────────────────────────────

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

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _usdc) {
        owner = msg.sender;
        usdc  = IERC20(_usdc);
    }

    // ─── Admin: opprett challenge ─────────────────────────────────────────────

    /**
     * @notice Opprett et nytt challenge
     * @param name        Navn på challenget
     * @param description Kort beskrivelse
     * @param entryFee    Innskudd i USDC (6 desimaler). 0 = gratis deltakelse
     * @param goal        Antall deltakere som fullfører = suksess
     * @param durationDays Antall dager til deadline
     */
    function createChallenge(
        string calldata name,
        string calldata description,
        uint256 entryFee,
        uint256 goal,
        uint256 durationDays
    ) external onlyOwner {
        require(goal > 0, "Goal must be > 0");
        require(durationDays > 0, "Duration must be > 0");

        challengeCount++;
        uint256 deadline = block.timestamp + (durationDays * 1 days);

        challenges[challengeCount] = Challenge({
            id:               challengeCount,
            name:             name,
            description:      description,
            entryFee:         entryFee,
            goal:             goal,
            deadline:         deadline,
            active:           true,
            participantCount: 0,
            prizePool:        0
        });

        emit ChallengeCreated(challengeCount, name, entryFee, goal, deadline);
    }

    // ─── Bruker: sett inn USDC ────────────────────────────────────────────────

    /**
     * @notice Sett inn USDC på kontoen din på QuestCast
     * Brukeren må ha godkjent kontrakten (approve) i USDC-kontrakten først.
     * @param amount Antall USDC (6 desimaler)
     */
    function deposit(uint256 amount) external noReentrancy {
        require(amount > 0, "Amount must be > 0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    // ─── Bruker: ta ut USDC ───────────────────────────────────────────────────

    /**
     * @notice Ta ut hele eller deler av balansen din
     * @param amount Antall USDC å ta ut (6 desimaler)
     */
    function withdraw(uint256 amount) external noReentrancy {
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    // ─── Bruker: bli med i challenge ─────────────────────────────────────────

    /**
     * @notice Delta i et challenge. Trekker entryFee fra brukerens balanse.
     * @param challengeId ID-en til challenget
     */
    function joinChallenge(uint256 challengeId)
        external
        noReentrancy
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        require(c.active, "Challenge not active");
        require(block.timestamp < c.deadline, "Challenge deadline passed");
        require(!hasJoined[challengeId][msg.sender], "Already joined");

        if (c.entryFee > 0) {
            require(balances[msg.sender] >= c.entryFee, "Insufficient balance for entry");
            balances[msg.sender] -= c.entryFee;
            c.prizePool += c.entryFee;
        }

        hasJoined[challengeId][msg.sender] = true;
        c.participantCount++;

        emit ChallengeJoined(challengeId, msg.sender);
    }

    // ─── Admin: avslutt challenge og betal ut vinnere ────────────────────────

    /**
     * @notice Fullfør et challenge og send premien til vinnerne
     * @param challengeId ID-en til challenget
     * @param winners     Liste over vinnere (wallet-adresser)
     */
    function completeChallenge(uint256 challengeId, address[] calldata winners)
        external
        onlyOwner
        noReentrancy
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        require(c.active, "Already completed");
        require(winners.length > 0, "No winners");

        c.active = false;

        if (c.prizePool > 0 && winners.length > 0) {
            uint256 prizePerWinner = c.prizePool / winners.length;
            for (uint256 i = 0; i < winners.length; i++) {
                require(hasJoined[challengeId][winners[i]], "Winner did not join");
                balances[winners[i]] += prizePerWinner;
            }
            emit ChallengeCompleted(challengeId, winners, prizePerWinner);
        }
    }

    // ─── Admin: kanseller challenge og refunder deltakere ────────────────────

    /**
     * @notice Kanseller et challenge og refunder alle entry fees
     * @param challengeId  ID-en til challenget
     * @param participants Liste over alle som jointet (må sendes inn av owner)
     */
    function cancelChallenge(uint256 challengeId, address[] calldata participants)
        external
        onlyOwner
        challengeExists(challengeId)
    {
        Challenge storage c = challenges[challengeId];
        require(c.active, "Already completed");
        c.active = false;

        if (c.entryFee > 0) {
            for (uint256 i = 0; i < participants.length; i++) {
                if (hasJoined[challengeId][participants[i]]) {
                    balances[participants[i]] += c.entryFee;
                }
            }
        }
        c.prizePool = 0;
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getChallenge(uint256 id) external view returns (Challenge memory) {
        return challenges[id];
    }

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    function isParticipant(uint256 challengeId, address user) external view returns (bool) {
        return hasJoined[challengeId][user];
    }
}
