let userScore = 0;
let computerScore = 0;
let provider;
let signer;
let contract;
let currentAddress = ""; // Store current user address

const contractAddress = '0x105d08A3639A2D48C31D9a218b3202A749bD46e4';
const contractABI = [
    "function play(uint8 _playerMove) external payable",
    "function deposit() external payable",
    "function withdraw() external",
    "function owner() external view returns (address)",
    "event GameResult(address player, uint8 playerMove, uint8 computerMove, string result, uint256 payout)"
];

const userScore_span = document.getElementById('user-score');
const computerScore_span = document.getElementById('computer-score');
const result_p = document.querySelector('.result > p');
const rock_div = document.getElementById('r');
const paper_div = document.getElementById('p');
const scissors_div = document.getElementById('s');
const connectBtn = document.getElementById('connectBtn');
const depositBtn = document.getElementById('depositBtn');
const depositInput = document.getElementById('depositAmount');
const houseBalance_span = document.getElementById('houseBalance');
const historyTableBody = document.querySelector('#historyTable tbody');
const loader = document.getElementById('loader');
const statusText = document.getElementById('statusText');
const choices_div = document.querySelector('.choices');

// --- HELPER FUNCTIONS ---

function convertToWord(choice) {
    if (choice === 1 || choice === 'r') return "Rock";
    if (choice === 2 || choice === 'p') return "Paper";
    return "Scissors";
}

function mapChoiceToNumber(letter) {
    if (letter === 'r') return 1;
    if (letter === 'p') return 2;
    return 3;
}

function mapNumberToLetter(num) {
    if (num === 1) return 'r';
    if (num === 2) return 'p';
    return 's';
}

function setLoading(isLoading, message = "") {
    if (isLoading) {
        loader.style.display = "inline-block";
        statusText.innerText = message;
        choices_div.classList.add('disabled');
    } else {
        loader.style.display = "none";
        choices_div.classList.remove('disabled');
        if (message) statusText.innerText = message;
    }
}

// --- LOCAL HISTORY MANAGEMENT ---

function saveGameToLocalHistory(result, payout, txHash) {
    if (!currentAddress) return;
    
    const key = `rps_history_${currentAddress}`;
    const history = JSON.parse(localStorage.getItem(key) || "[]");
    
    const newGame = {
        result: result,
        payout: payout,
        txHash: txHash,
        timestamp: new Date().getTime()
    };
    
    // Add to beginning of array
    history.unshift(newGame);
    
    // Keep only last 20 games
    if (history.length > 20) history.pop();
    
    localStorage.setItem(key, JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    if (!currentAddress) return;
    
    const key = `rps_history_${currentAddress}`;
    const history = JSON.parse(localStorage.getItem(key) || "[]");
    
    historyTableBody.innerHTML = "";
    
    if (history.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="3" style="text-align:center;">No games played yet on this device.</td>`;
        historyTableBody.appendChild(row);
        return;
    }
    
    history.forEach(game => {
        const date = new Date(game.timestamp).toLocaleTimeString();
        const row = document.createElement('tr');
        
        // Link to explorer
        const explorerLink = `https://testnet.bscscan.com/tx/${game.txHash}`;
        
        row.innerHTML = `
            <td><a href="${explorerLink}" target="_blank" style="color: #4db8ff; text-decoration: none;">View Tx ↗</a></td>
            <td style="color: ${game.result === 'Win' ? '#00ff00' : (game.result === 'Lose' ? '#ff0000' : '#ffff00')}">${game.result}</td>
            <td>${parseFloat(game.payout).toFixed(4)}</td>
        `;
        historyTableBody.appendChild(row);
    });
}

// --- CORE FUNCTIONS ---

async function updateHouseBalance() {
    if (!contract || !provider) return;
    try {
        const balanceWei = await provider.getBalance(contractAddress);
        const balanceEth = ethers.formatEther(balanceWei);
        houseBalance_span.innerText = parseFloat(balanceEth).toFixed(4);
    } catch (error) {
        console.error("Balance Error:", error);
    }
}

async function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        connectBtn.innerText = "Connect Wallet";
        statusText.innerText = "Please connect wallet!";
        contract = null;
        signer = null;
        currentAddress = "";
        historyTableBody.innerHTML = "";
    } else {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        contract = new ethers.Contract(contractAddress, contractABI, signer);
        
        currentAddress = accounts[0].toLowerCase();
        connectBtn.innerText = currentAddress.substring(0, 6) + "...";
        statusText.innerText = "Ready to play!";
        
        updateHouseBalance();
        renderHistory(); // Load history from LocalStorage
    }
}

async function connectWallet() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            await handleAccountsChanged(accounts);
        } catch (error) {
            console.error(error);
            statusText.innerText = "Connection failed.";
        }
    } else {
        statusText.innerText = "Please install MetaMask!";
    }
}

async function game(userChoiceLetter) {
    if (!contract) {
        statusText.innerText = "Please connect wallet first!";
        return;
    }

    const userMoveNum = mapChoiceToNumber(userChoiceLetter);
    
    try {
        setLoading(true, "Confirm transaction in MetaMask...");
        
        const tx = await contract.play(userMoveNum, {
            value: ethers.parseEther("0.0001") 
        });

        setLoading(true, "Mining... (Wait for confirmation)");

        const receipt = await tx.wait();

        setLoading(true, "Processing result...");
        
        await updateHouseBalance();

        let gameEvent;
        for (const log of receipt.logs) {
            try {
                // Check if log is from our contract to avoid parsing internal transfer events
                if (log.address.toLowerCase() === contractAddress.toLowerCase()) {
                    const parsedLog = contract.interface.parseLog(log);
                    if (parsedLog && parsedLog.name === "GameResult") {
                        gameEvent = parsedLog;
                        break;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        setLoading(false);

        if (gameEvent) {
            const computerMoveNum = Number(gameEvent.args[2]); 
            const resultString = gameEvent.args[3]; 
            const payout = ethers.formatEther(gameEvent.args[4]);
            const computerLetter = mapNumberToLetter(computerMoveNum);

            // Save to Local History immediately
            saveGameToLocalHistory(resultString, payout, tx.hash);

            if (resultString === "Win") {
                win(userChoiceLetter, computerLetter);
            } else if (resultString === "Lose") {
                lose(userChoiceLetter, computerLetter);
            } else {
                draw(userChoiceLetter, computerLetter);
            }
        } else {
            statusText.innerText = "Game finished, but event log not found.";
        }

    } catch (error) {
        console.error(error);
        setLoading(false, "Transaction failed or rejected.");
    }
}

function win(userChoice, computerChoice) {
    userScore++;
    userScore_span.innerHTML = userScore;
    computerScore_span.innerHTML = computerScore;
    statusText.innerHTML = `${convertToWord(userChoice)} beats ${convertToWord(computerChoice)}. <span style="color:#00ff00">You Win!</span>`;
    document.getElementById(userChoice).classList.add('green-glow');
    setTimeout(() => document.getElementById(userChoice).classList.remove('green-glow'), 500);
}

function lose(userChoice, computerChoice) {
    computerScore++;
    userScore_span.innerHTML = userScore;
    computerScore_span.innerHTML = computerScore;
    statusText.innerHTML = `${convertToWord(userChoice)} loses to ${convertToWord(computerChoice)}. <span style="color:#ff0000">You Lost.</span>`;
    document.getElementById(userChoice).classList.add('red-glow');
    setTimeout(() => document.getElementById(userChoice).classList.remove('red-glow'), 500);
}

function draw(userChoice, computerChoice) {
    statusText.innerHTML = `${convertToWord(userChoice)} equals ${convertToWord(computerChoice)}. <span style="color:#ffff00">It's a Draw.</span>`;
    document.getElementById(userChoice).classList.add('gray-glow');
    setTimeout(() => document.getElementById(userChoice).classList.remove('gray-glow'), 500);
}

async function depositFunds() {
    if (!contract) {
        alert("Please connect wallet first!");
        return;
    }

    const amount = depositInput.value;
    if (!amount || amount <= 0) {
        alert("Please enter a valid amount");
        return;
    }

    try {
        statusText.innerText = "Depositing...";
        const tx = await contract.deposit({
            value: ethers.parseEther(amount.toString())
        });
        await tx.wait();
        statusText.innerText = "Deposit successful!";
        updateHouseBalance();
    } catch (error) {
        console.error(error);
        statusText.innerText = "Deposit failed.";
    }
}

function main() {
    connectBtn.addEventListener('click', connectWallet);
    depositBtn.addEventListener('click', depositFunds); 

    rock_div.addEventListener('click', function() { game('r'); });
    paper_div.addEventListener('click', function() { game('p'); });
    scissors_div.addEventListener('click', function() { game('s'); });

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
        
        // Auto-connect check
        window.ethereum.request({ method: 'eth_accounts' })
            .then(handleAccountsChanged)
            .catch(console.error);
    }
}

main();