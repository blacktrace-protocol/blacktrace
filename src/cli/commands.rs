//! CLI command definitions

use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "blacktrace")]
#[command(about = "BlackTrace - Zero-Knowledge OTC Settlement for Zcash", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Start a BlackTrace node
    Node {
        /// Port to listen on
        #[arg(short, long, default_value = "9000")]
        port: u16,

        /// Peer address to connect to (optional)
        #[arg(short = 'c', long)]
        connect: Option<String>,
    },

    /// Create a new order
    Order {
        #[command(subcommand)]
        action: OrderAction,
    },

    /// Manage negotiations
    Negotiate {
        #[command(subcommand)]
        action: NegotiateAction,
    },

    /// Query information
    Query {
        #[command(subcommand)]
        action: QueryAction,
    },
}

#[derive(Subcommand, Debug)]
pub enum OrderAction {
    /// Create a new sell order
    Create {
        /// Amount of ZEC to sell
        #[arg(short, long)]
        amount: u64,

        /// Stablecoin type (USDC, USDT, DAI)
        #[arg(short, long)]
        stablecoin: String,

        /// Minimum price per ZEC
        #[arg(short = 'p', long)]
        min_price: u64,

        /// Maximum price per ZEC
        #[arg(short = 'P', long)]
        max_price: u64,
    },

    /// List all orders
    List,

    /// Cancel an order
    Cancel {
        /// Order ID to cancel
        order_id: String,
    },
}

#[derive(Subcommand, Debug)]
pub enum NegotiateAction {
    /// Request order details
    Request {
        /// Order ID to negotiate
        order_id: String,
    },

    /// Propose a price
    Propose {
        /// Order ID
        order_id: String,

        /// Proposed price
        #[arg(short, long)]
        price: u64,

        /// Amount
        #[arg(short, long)]
        amount: u64,
    },

    /// Accept current terms
    Accept {
        /// Order ID
        order_id: String,
    },

    /// Cancel negotiation
    Cancel {
        /// Order ID
        order_id: String,

        /// Reason for cancellation
        #[arg(short, long)]
        reason: String,
    },
}

#[derive(Subcommand, Debug)]
pub enum QueryAction {
    /// List connected peers
    Peers,

    /// Show orders
    Orders,

    /// Show active negotiations
    Negotiations,

    /// Show negotiation details
    Negotiation {
        /// Order ID
        order_id: String,
    },
}
