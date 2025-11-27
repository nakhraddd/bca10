pragma solidity ^0.8.0;

contract RockPaperScissors {
    address public owner;
    uint256 public constant MIN_BET = 0.0001 ether;

    event GameResult(address player, uint8 playerMove, uint8 computerMove, string result, uint256 payout);

    constructor() payable {
        owner = msg.sender;
    }

    function play(uint8 _playerMove) external payable {
        require(msg.value >= MIN_BET, "Bet amount too low");
        require(_playerMove >= 1 && _playerMove <= 3, "Invalid move. 1=Rock, 2=Paper, 3=Scissors");
        require(address(this).balance >= msg.value * 2, "Contract has insufficient funds to pay out");

        uint8 computerMove = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender))) % 3) + 1;

        if (_playerMove == computerMove) {
            payable(msg.sender).transfer(msg.value);
            emit GameResult(msg.sender, _playerMove, computerMove, "Draw", msg.value);
        } else if (
            (_playerMove == 1 && computerMove == 3) || 
            (_playerMove == 2 && computerMove == 1) || 
            (_playerMove == 3 && computerMove == 2)
        ) {
            uint256 prize = msg.value * 2;
            payable(msg.sender).transfer(prize);
            emit GameResult(msg.sender, _playerMove, computerMove, "Win", prize);
        } else {
            emit GameResult(msg.sender, _playerMove, computerMove, "Lose", 0);
        }
    }

    function deposit() external payable {}

    function withdraw() external {
        require(msg.sender == owner, "Only owner can withdraw");
        payable(owner).transfer(address(this).balance);
    }
}