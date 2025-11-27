let userScore = 0;
let computerScore = 0;
let provider;
let signer;
let contract;

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
const scoreBoard_div = document.querySelector('.score-board');
const result_p = document.querySelector('.result > p');
const rock_div = document.getElementById('r');
const paper_div = document.getElementById('p');
const scissors_div = document.getElementById('s');
const connectBtn = document.getElementById('connectBtn');
const depositBtn = document.getElementById('depositBtn');
const depositInput = document.getElementById('depositAmount');
const houseBalance_span = document.getElementById('houseBalance');

async function updateHouseBalance() {
    if (!contract || !provider) return;

    try {
        // Get balance of the contract address directly from provider
        const balanceWei = await provider.getBalance(contractAddress);
        // Convert Wei to Ether (BNB) string
        const balanceEth = ethers.formatEther(balanceWei);
        // Update UI (limit to 4 decimals for cleaner look)
        houseBalance_span.innerText = parseFloat(balanceEth).toFixed(4);
    } catch (error) {
        console.error("Error fetching balance:", error);
    }
}

async function connectWallet() {
    if (window.ethereum) {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            contract = new ethers.Contract(contractAddress, contractABI, signer);
            
            const address = await signer.getAddress();
            connectBtn.innerText = "Connected: " + address.substring(0, 6) + "...";
            result_p.innerText = "Wallet Connected! Make your move.";
            
            updateHouseBalance(); 
            
        } catch (error) {
            console.error(error);
            result_p.innerText = "Connection failed.";
        }
    } else {
        result_p.innerText = "Please install MetaMask!";
    }
}

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

function win(userChoice, computerChoice) {
    userScore++;
    userScore_span.innerHTML = userScore;
    computerScore_span.innerHTML = computerScore;
    const smallUserWord = "user".fontsize(3).sub();
    const smallCompWord = "comp".fontsize(3).sub();
    result_p.innerHTML = `${convertToWord(userChoice)}${smallUserWord} beats ${convertToWord(computerChoice)}${smallCompWord}. You win!`;
}

function lose(userChoice, computerChoice) {
    computerScore++;
    userScore_span.innerHTML = userScore;
    computerScore_span.innerHTML = computerScore;
    const smallUserWord = "user".fontsize(3).sub();
    const smallCompWord = "comp".fontsize(3).sub();
    result_p.innerHTML = `${convertToWord(userChoice)}${smallUserWord} loses to ${convertToWord(computerChoice)}${smallCompWord}. You lost...`;
}

function draw(userChoice, computerChoice) {
    const smallUserWord = "user".fontsize(3).sub();
    const smallCompWord = "comp".fontsize(3).sub();
    result_p.innerHTML = `${convertToWord(userChoice)}${smallUserWord} equals ${convertToWord(computerChoice)}${smallCompWord}. It's a draw.`;
}

async function game(userChoiceLetter) {
    if (!contract) {
        result_p.innerText = "Please connect wallet first!";
        return;
    }

    const userMoveNum = mapChoiceToNumber(userChoiceLetter);
    
    try {
        result_p.innerText = "Initiating transaction... Check MetaMask.";
        
        const tx = await contract.play(userMoveNum, {
            value: ethers.parseEther("0.0001") 
        });

        result_p.innerText = "Mining... Please wait.";

        const receipt = await tx.wait();
        updateHouseBalance();

        let gameEvent;
        for (const log of receipt.logs) {
            try {
                const parsedLog = contract.interface.parseLog(log);
                if (parsedLog.name === "GameResult") {
                    gameEvent = parsedLog;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (gameEvent) {
            const computerMoveNum = Number(gameEvent.args[2]); 
            const resultString = gameEvent.args[3]; 

            const computerLetter = mapNumberToLetter(computerMoveNum);

            if (resultString === "Win") {
                win(userChoiceLetter, computerLetter);
            } else if (resultString === "Lose") {
                lose(userChoiceLetter, computerLetter);
            } else {
                draw(userChoiceLetter, computerLetter);
            }
        }

    } catch (error) {
        console.error(error);
        result_p.innerText = "Transaction failed or rejected.";
    }
}

async function depositFunds() {
    if (!contract) {
        alert("Please connect wallet first!");
        return;
    }

    const amount = depositInput.value;
    if (!amount || amount <= 0) {
        alert("Please enter a valid amount (e.g. 0.01)");
        return;
    }

    try {
        result_p.innerText = "Depositing funds... Check MetaMask.";
        
        // We call the 'deposit' function and send ETH along with it
        const tx = await contract.deposit({
            value: ethers.parseEther(amount.toString())
        });

        result_p.innerText = "Processing deposit...";
        await tx.wait();
        result_p.innerText = "Deposit successful! House is funded.";
    
        updateHouseBalance();
        
        alert("Deposit Successful! You can now play.");


    } catch (error) {
        console.error("Deposit Error:", error);
        result_p.innerText = "Deposit failed.";
    }
}

function main() {
    connectBtn.addEventListener('click', connectWallet);
    
    // NEW LISTENER
    depositBtn.addEventListener('click', depositFunds); 

    rock_div.addEventListener('click', function() { game('r'); });
    paper_div.addEventListener('click', function() { game('p'); });
    scissors_div.addEventListener('click', function() { game('s'); });
}

main();