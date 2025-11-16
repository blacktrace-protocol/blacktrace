//! BlackTrace CLI binary

use blacktrace::cli::{BlackTraceApp, Cli, Commands, NegotiateAction, OrderAction, QueryAction};
use clap::Parser;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Node { port, connect } => {
            tracing::info!("Starting BlackTrace node on port {}", port);

            let app = BlackTraceApp::new(port).await?;

            // Connect to peer if specified
            if let Some(peer_addr) = connect {
                tracing::info!("Connecting to peer: {}", peer_addr);
                app.connect_to_peer(&peer_addr).await?;
            }

            // Run event loop
            tracing::info!("Node running. Press Ctrl+C to stop.");
            app.run_event_loop().await;
        }

        Commands::Order { action } => {
            // For order commands, we need a running node
            // In a real implementation, this would connect to a running node via IPC/RPC
            // For MVP, we'll note this limitation
            tracing::error!("Order commands require a running node. Please start a node first with: blacktrace node");
            tracing::info!("Future: These commands will communicate with a running node via IPC");

            // Show what would be executed
            match action {
                OrderAction::Create {
                    amount,
                    stablecoin,
                    min_price,
                    max_price,
                } => {
                    tracing::info!(
                        "Would create order: {} ZEC for {} (min: {}, max: {})",
                        amount,
                        stablecoin,
                        min_price,
                        max_price
                    );
                }
                OrderAction::List => {
                    tracing::info!("Would list all orders");
                }
                OrderAction::Cancel { order_id } => {
                    tracing::info!("Would cancel order: {}", order_id);
                }
            }
        }

        Commands::Negotiate { action } => {
            tracing::error!("Negotiate commands require a running node. Please start a node first with: blacktrace node");
            tracing::info!("Future: These commands will communicate with a running node via IPC");

            match action {
                NegotiateAction::Request { order_id } => {
                    tracing::info!("Would request details for order: {}", order_id);
                }
                NegotiateAction::Propose {
                    order_id,
                    price,
                    amount,
                } => {
                    tracing::info!(
                        "Would propose price {} for {} ZEC on order {}",
                        price,
                        amount,
                        order_id
                    );
                }
                NegotiateAction::Accept { order_id } => {
                    tracing::info!("Would accept terms for order: {}", order_id);
                }
                NegotiateAction::Cancel { order_id, reason } => {
                    tracing::info!("Would cancel negotiation for order {}: {}", order_id, reason);
                }
            }
        }

        Commands::Query { action } => {
            tracing::error!("Query commands require a running node. Please start a node first with: blacktrace node");
            tracing::info!("Future: These commands will communicate with a running node via IPC");

            match action {
                QueryAction::Peers => {
                    tracing::info!("Would list connected peers");
                }
                QueryAction::Orders => {
                    tracing::info!("Would list all known orders");
                }
                QueryAction::Negotiations => {
                    tracing::info!("Would list active negotiations");
                }
                QueryAction::Negotiation { order_id } => {
                    tracing::info!("Would show details for negotiation: {}", order_id);
                }
            }
        }
    }

    Ok(())
}
