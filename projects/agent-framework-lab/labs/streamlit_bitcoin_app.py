"""Streamlit 比特币价格显示应用。

运行：
    streamlit run labs/streamlit_bitcoin_app.py
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

import requests
import streamlit as st

API_URL = "https://api.coingecko.com/api/v3/simple/price"


def get_bitcoin_price() -> Dict[str, Any]:
    """获取 BTC/USD 当前价格和 24 小时变化。失败时返回演示数据。"""
    params = {
        "ids": "bitcoin",
        "vs_currencies": "usd",
        "include_24hr_change": "true",
        "include_24hr_vol": "true",
        "include_market_cap": "true",
    }
    try:
        response = requests.get(API_URL, params=params, timeout=8)
        response.raise_for_status()
        data = response.json()["bitcoin"]
        return {
            "source": "CoinGecko API",
            "usd": float(data["usd"]),
            "usd_24h_change": float(data.get("usd_24h_change", 0.0)),
            "usd_24h_vol": float(data.get("usd_24h_vol", 0.0)),
            "usd_market_cap": float(data.get("usd_market_cap", 0.0)),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "source": f"演示数据；API 调用失败：{exc}",
            "usd": 65000.0,
            "usd_24h_change": 1.25,
            "usd_24h_vol": 30_000_000_000.0,
            "usd_market_cap": 1_280_000_000_000.0,
        }


def main() -> None:
    st.set_page_config(page_title="BTC Price Dashboard", page_icon="₿", layout="centered")
    st.title("₿ 比特币实时价格看板")
    st.caption("第六章 AutoGen 软件开发团队实验的目标应用：实时显示 BTC/USD 价格。")

    if "refresh_count" not in st.session_state:
        st.session_state.refresh_count = 0

    col_a, col_b = st.columns([1, 1])
    with col_a:
        if st.button("刷新价格", use_container_width=True):
            st.session_state.refresh_count += 1
    with col_b:
        st.write("刷新次数：", st.session_state.refresh_count)

    with st.spinner("正在获取价格数据..."):
        data = get_bitcoin_price()

    price = data["usd"]
    change = data["usd_24h_change"]
    delta_text = f"{change:.2f}%"

    st.metric("BTC 当前价格（USD）", f"${price:,.2f}", delta=delta_text)

    col1, col2 = st.columns(2)
    col1.metric("24h 交易量", f"${data['usd_24h_vol']:,.0f}")
    col2.metric("市值", f"${data['usd_market_cap']:,.0f}")

    if change >= 0:
        st.success("过去 24 小时价格上涨。")
    else:
        st.error("过去 24 小时价格下跌。")

    st.info(f"数据来源：{data['source']}")
    st.caption(f"页面生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
