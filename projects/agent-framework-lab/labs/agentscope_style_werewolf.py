"""AgentScope 风格教学实验：三国狼人杀。

不依赖 AgentScope。该脚本模拟消息中心 MsgHub、玩家状态和结构化行动。
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)


@dataclass
class Player:
    name: str
    character: str
    game_role: str
    alive: bool = True


@dataclass
class VoteAction:
    voter: str
    vote: str
    reason: str
    confidence: int


class MessageHub:
    """最小消息中心：负责广播和记录消息。"""

    def __init__(self) -> None:
        self.messages: List[Dict[str, str]] = []

    def broadcast(self, sender: str, content: str) -> None:
        self.messages.append({"sender": sender, "content": content})
        print(f"[{sender}] {content}")


def make_players() -> List[Player]:
    return [
        Player("刘备", "仁德宽厚，重视联盟", "村民"),
        Player("关羽", "忠义刚烈，发言直接", "猎人"),
        Player("张飞", "豪爽冲动，容易怀疑他人", "村民"),
        Player("诸葛亮", "分析透彻，偏理性推理", "预言家"),
        Player("曹操", "善于权谋，隐藏锋芒", "狼人"),
        Player("司马懿", "深谋远虑，善于伪装", "狼人"),
    ]


def night_phase(players: List[Player], hub: MessageHub) -> str:
    wolves = [p for p in players if p.game_role == "狼人" and p.alive]
    target = "诸葛亮"
    hub.broadcast("系统", "夜晚开始。狼人通过私有消息协商击杀目标。")
    for wolf in wolves:
        hub.broadcast(wolf.name, f"我建议优先处理推理能力强的玩家，目标：{target}。")
    hub.broadcast("系统", f"狼人达成一致，夜晚目标为：{target}。")
    for p in players:
        if p.name == target:
            p.alive = False
    return target


def day_phase(players: List[Player], hub: MessageHub) -> List[VoteAction]:
    hub.broadcast("系统", "白天开始。公布夜晚死亡，并进入自由讨论。")
    for p in players:
        if p.alive:
            suspicion = "曹操" if p.name in {"刘备", "关羽", "张飞"} else "刘备"
            hub.broadcast(p.name, f"基于昨夜结果和发言风格，我当前怀疑 {suspicion}。")

    votes = [
        VoteAction("刘备", "曹操", "曹操发言过于保守，有隐藏身份倾向", 7),
        VoteAction("关羽", "曹操", "我相信诸葛亮遇害与曹操阵营有关", 8),
        VoteAction("张飞", "曹操", "俺觉得曹操最可疑", 6),
        VoteAction("曹操", "刘备", "刘备带节奏明显", 6),
        VoteAction("司马懿", "刘备", "刘备形成联盟过快", 7),
    ]
    for vote in votes:
        hub.broadcast(vote.voter, f"投票给 {vote.vote}；理由：{vote.reason}；信心：{vote.confidence}/10")
    return votes


def eliminate_by_votes(players: List[Player], votes: List[VoteAction], hub: MessageHub) -> str:
    tally: Dict[str, int] = {}
    for vote in votes:
        tally[vote.vote] = tally.get(vote.vote, 0) + 1
    eliminated = max(tally, key=tally.get)
    for p in players:
        if p.name == eliminated:
            p.alive = False
    hub.broadcast("系统", f"投票结果：{tally}。{eliminated} 被放逐。")
    return eliminated


def main() -> None:
    players = make_players()
    hub = MessageHub()
    killed = night_phase(players, hub)
    votes = day_phase(players, hub)
    eliminated = eliminate_by_votes(players, votes, hub)

    result = {
        "players": [asdict(p) for p in players],
        "night_killed": killed,
        "day_votes": [asdict(v) for v in votes],
        "day_eliminated": eliminated,
        "messages": hub.messages,
    }
    out = OUT / "agentscope_style_werewolf_log.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已保存游戏日志：{out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
