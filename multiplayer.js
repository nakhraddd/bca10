let provider, signer, contract;
let currentAddress;

// REPLACE THIS WITH THE ADDRESS OF THE NEW PVP CONTRACT YOU DEPLOY
const pvpContractAddress = "0xB2E837bF680b33EF3d9BB68732F57590bee0981a"; 

const pvpAbi = [
    "function createGame(uint8 _move) external payable returns (uint256)",
    "function joinGame(uint256 _gameId, uint8 _move) external payable",
    "function games(uint256) view returns (address, address, uint256, uint8, uint8, bool, bool, address)",
    "event GameCreated(uint256 gameId, address player1, uint256 bet)",
    "event PlayerJoined(uint256 gameId, address player2)",
    "event GameFinished(uint256 gameId, address winner, uint8 p1Move, uint8 p2Move)"
];

const connectBtn = document.getElementById('connectBtn');
const lobbyStatus = document.getElementById('lobbyStatus');
const lobbySection = document.getElementById('lobby-section');
const gameInterface = document.getElementById('game-interface');
const statusText = document.getElementById('statusText');
const loader = document.getElementById('loader');
const historyTableBody = document.querySelector('#historyTable tbody');

let selectedMode = ""; 
let targetGameId = -1;
let pollingInterval = null; 

async function init() {
    if (window.ethereum) {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            contract = new ethers.Contract(pvpContractAddress, pvpAbi, signer);
            currentAddress = await signer.getAddress();
            connectBtn.innerText = currentAddress.substring(0,6) + "...";
            
            setupListeners();
            renderHistory(); // Load history on connect
        } catch (e) {
            console.error(e);
            lobbyStatus.innerText = "Connection Failed";
        }
    } else {
        alert("Install MetaMask");
    }
}

function setupListeners() {
    document.getElementById('createGameBtn').addEventListener('click', () => {
        selectedMode = "create";
        startGameUI("Select your move to create a game");
    });

    document.getElementById('joinGameBtn').addEventListener('click', () => {
        const id = document.getElementById('joinGameId').value;
        if (!id) { alert("Enter Game ID"); return; }
        selectedMode = "join";
        targetGameId = id;
        startGameUI(`Select move to Join Game #${id}`);
    });
}

function startGameUI(msg) {
    lobbySection.style.display = 'none';
    gameInterface.style.display = 'block';
    statusText.innerText = msg;
}

// --- HISTORY FUNCTIONS ---

function saveMultiplayerHistory(gameId, result, opponentMove, payout) {
    if (!currentAddress) return;
    
    const key = `rps_multiplayer_history_${currentAddress.toLowerCase()}`;
    const history = JSON.parse(localStorage.getItem(key) || "[]");
    
    // Check if game ID already exists to prevent duplicates
    if (history.some(g => g.id.toString() === gameId.toString())) return;

    const newGame = {
        id: gameId.toString(),
        result: result,
        vs: opponentMove,
        payout: payout,
        timestamp: new Date().getTime()
    };
    
    history.unshift(newGame);
    if (history.length > 20) history.pop();
    
    localStorage.setItem(key, JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    if (!currentAddress) return;
    
    const key = `rps_multiplayer_history_${currentAddress.toLowerCase()}`;
    const history = JSON.parse(localStorage.getItem(key) || "[]");
    
    historyTableBody.innerHTML = "";
    
    if (history.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="4" style="text-align:center;">No multiplayer games yet.</td>`;
        historyTableBody.appendChild(row);
        return;
    }
    
    history.forEach(game => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>#${game.id}</td>
            <td style="color: ${game.result === 'WON' ? '#00ff00' : (game.result === 'LOST' ? '#ff0000' : '#ffff00')}">${game.result}</td>
            <td>${game.vs}</td>
            <td>${game.payout} ETH</td>
        `;
        historyTableBody.appendChild(row);
    });
}

// --- GAME LOGIC ---

async function selectMove(moveNum) {
    if (!contract) return;

    try {
        const bet = document.getElementById('betAmount').value;
        
        let tx;
        if (selectedMode === "create") {
            setLoading(true, "Creating Game... Confirm in Wallet.");
            tx = await contract.createGame(moveNum, { value: ethers.parseEther(bet) });
            setLoading(true, "Mining creation transaction...");
        } else {
            setLoading(true, "Joining Game... Confirm in Wallet.");
            tx = await contract.joinGame(targetGameId, moveNum, { value: ethers.parseEther(bet) });
            setLoading(true, "Joining... Waiting for blockchain result.");
        }

        const receipt = await tx.wait();
        handleTransactionReceipt(receipt);

    } catch (error) {
        console.error(error);
        setLoading(false);
        statusText.innerText = "Transaction failed: " + (error.reason || error.message);
        setTimeout(() => {
            location.reload(); 
        }, 3000);
    }
}

function handleTransactionReceipt(receipt) {
    for (const log of receipt.logs) {
        try {
            const parsed = contract.interface.parseLog(log);
            
            if (parsed.name === "GameCreated") {
                const id = parsed.args[0];
                statusText.innerHTML = `Game Created! <br> <span style="font-size: 24px; color: #4db8ff;">ID: ${id}</span> <br> Waiting for opponent to join...`;
                document.querySelector('.choices').style.display = 'none'; 
                
                waitForOpponent(id);
            } 
            
            else if (parsed.name === "GameFinished") {
                // For Player 2 (Immediate Result)
                // We grab the game ID from the event args
                const gId = parsed.args[0];
                showFinalResult(gId, parsed.args[1], parsed.args[2], parsed.args[3]);
            }
        } catch (e) {}
    }
}

async function waitForOpponent(gameId) {
    console.log("Starting polling for Game ID:", gameId);
    checkGameStatus(gameId);
    pollingInterval = setInterval(() => {
        checkGameStatus(gameId);
    }, 3000);
}

async function checkGameStatus(gameId) {
    try {
        const gameData = await contract.games(gameId);
        const isFinished = gameData[6]; 

        if (isFinished) {
            clearInterval(pollingInterval);
            const p1Move = gameData[3];
            const p2Move = gameData[4];
            const winner = gameData[7];
            
            // For Player 1 (Creator)
            showFinalResult(gameId, winner, p1Move, p2Move, gameData[2]); // gameData[2] is bet amount
        }
    } catch (e) {
        console.error("Polling error:", e);
    }
}

function showFinalResult(gameId, winner, p1Move, p2Move, betAmountBN) {
    setLoading(false);
    document.querySelector('.choices').style.display = 'flex'; 
    document.querySelector('.choices').style.pointerEvents = 'none'; 

    let resultMsg = "";
    let resultShort = ""; // For History
    let payout = "0.0000";
    let opponentMoveStr = "";

    // Determine Bet Amount (Use input value as fallback if not passed from polling)
    const betVal = betAmountBN ? ethers.formatEther(betAmountBN) : document.getElementById('betAmount').value;

    if (winner.toLowerCase() === currentAddress.toLowerCase()) {
        resultMsg = "<span style='color: #00ff00; font-size: 28px;'>YOU WON!</span>";
        resultShort = "WON";
        payout = (parseFloat(betVal) * 2).toFixed(4); // Simple calc for display
    } else if (winner === "0x0000000000000000000000000000000000000000") {
        resultMsg = "<span style='color: #ffff00; font-size: 28px;'>DRAW!</span>";
        resultShort = "DRAW";
        payout = parseFloat(betVal).toFixed(4);
    } else {
        resultMsg = "<span style='color: #ff0000; font-size: 28px;'>YOU LOST!</span>";
        resultShort = "LOST";
        payout = "0.0000";
    }

    // Determine who was opponent
    // If I created (Player 1), my move is p1Move, opponent is p2Move
    // If I joined (Player 2), my move is p2Move, opponent is p1Move
    // But honestly, for the UI, "P1 vs P2" is clear enough.
    // For history "VS", let's just show the move of the *other* person.
    
    // Simplification for history VS column:
    // If I am Player 1? We don't strictly know without checking address, 
    // but we can infer:
    // If I selected Mode 'create', I am P1. If 'join', I am P2.
    if (selectedMode === 'create') {
        opponentMoveStr = getMoveName(p2Move);
    } else {
        opponentMoveStr = getMoveName(p1Move);
    }

    statusText.innerHTML = `${resultMsg}<br> 
    P1 (${getMoveName(p1Move)}) vs P2 (${getMoveName(p2Move)}) <br>
    <button onclick="location.reload()" class="btn-small" style="margin-top:15px;">Play Again</button>`;
    
    loader.style.display = 'none';

    // Save to History
    saveMultiplayerHistory(gameId, resultShort, opponentMoveStr, payout);
}

function getMoveName(num) {
    const n = Number(num);
    if(n===1) return "Rock";
    if(n===2) return "Paper";
    if(n===3) return "Scissors";
    return "?";
}

function setLoading(isLoading, msg) {
    if (isLoading) {
        loader.style.display = 'inline-block';
        statusText.innerText = msg;
        document.querySelector('.choices').classList.add('disabled');
    } else {
        loader.style.display = 'none';
        document.querySelector('.choices').classList.remove('disabled');
    }
}

document.getElementById('connectBtn').addEventListener('click', init);