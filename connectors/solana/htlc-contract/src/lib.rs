use anchor_lang::prelude::*;
use anchor_lang::system_program;
use sha2::{Sha256, Digest};
use ripemd::Ripemd160;

declare_id!("CUxqXa849pvw3TLEWRrA2RyA3vm5SXXwb181BFnRSvej");

/// Compute HASH160 = RIPEMD160(SHA256(data)) - Bitcoin/Zcash standard
/// Returns a 20-byte hash
fn hash160(data: &[u8]) -> [u8; 20] {
    let sha256_hash = Sha256::digest(data);
    let ripemd_hash = Ripemd160::digest(&sha256_hash);
    let mut result = [0u8; 20];
    result.copy_from_slice(&ripemd_hash);
    result
}

/// BlackTrace HTLC Program for Solana
///
/// This contract implements Hash Time-Locked Contracts (HTLC) for atomic swaps.
/// Uses HASH160 (RIPEMD160(SHA256)) for compatibility with Zcash HTLC scripts.
/// Uses native SOL (lamports) instead of SPL tokens.
///
/// Flow:
/// 1. Sender locks SOL with a hash_lock (HASH160 of secret = 20 bytes)
/// 2. Receiver claims SOL by revealing the secret (pre-image)
/// 3. If timeout expires, sender can refund the SOL
#[program]
pub mod blacktrace_htlc {
    use super::*;

    /// Lock native SOL in an HTLC
    ///
    /// # Arguments
    /// * `hash_lock` - HASH160 of the secret (20 bytes) = RIPEMD160(SHA256(secret))
    /// * `receiver` - Public key of the receiver who can claim with the secret
    /// * `amount` - Amount of lamports to lock
    /// * `timeout` - Unix timestamp after which sender can refund
    pub fn lock(
        ctx: Context<Lock>,
        hash_lock: [u8; 20],
        receiver: Pubkey,
        amount: u64,
        timeout: i64,
    ) -> Result<()> {
        let htlc = &mut ctx.accounts.htlc;
        let clock = Clock::get()?;

        // Validate timeout is in the future
        require!(timeout > clock.unix_timestamp, HTLCError::InvalidTimeout);
        require!(amount > 0, HTLCError::InvalidAmount);

        // Initialize HTLC account
        htlc.hash_lock = hash_lock;
        htlc.sender = ctx.accounts.sender.key();
        htlc.receiver = receiver;
        htlc.amount = amount;
        htlc.timeout = timeout;
        htlc.claimed = false;
        htlc.refunded = false;
        htlc.bump = ctx.bumps.htlc;

        // Transfer SOL from sender to HTLC PDA account
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.sender.to_account_info(),
                to: htlc.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, amount)?;

        emit!(Locked {
            hash_lock,
            sender: ctx.accounts.sender.key(),
            receiver,
            amount,
            timeout,
        });

        msg!("HTLC locked: {} lamports for receiver {}", amount, receiver);
        Ok(())
    }

    /// Claim SOL by revealing the secret
    ///
    /// # Arguments
    /// * `hash_lock` - The hash_lock identifying the HTLC (20 bytes)
    /// * `secret` - The pre-image that hashes to hash_lock (HASH160)
    pub fn claim(
        ctx: Context<Claim>,
        hash_lock: [u8; 20],
        secret: Vec<u8>,
    ) -> Result<()> {
        let htlc = &mut ctx.accounts.htlc;

        // Verify HTLC state
        require!(!htlc.claimed, HTLCError::AlreadyClaimed);
        require!(!htlc.refunded, HTLCError::AlreadyRefunded);
        require!(htlc.hash_lock == hash_lock, HTLCError::HashMismatch);

        // Verify the secret: HASH160(secret) = RIPEMD160(SHA256(secret)) must equal hash_lock
        let computed_hash = hash160(&secret);
        require!(
            computed_hash == hash_lock,
            HTLCError::InvalidSecret
        );

        // Verify caller is the receiver
        require!(
            ctx.accounts.receiver.key() == htlc.receiver,
            HTLCError::NotReceiver
        );

        // Mark as claimed
        htlc.claimed = true;

        // Transfer SOL from HTLC PDA to receiver
        let amount = htlc.amount;
        **htlc.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.receiver.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(Claimed {
            hash_lock,
            receiver: ctx.accounts.receiver.key(),
            secret: secret.clone(),
            amount,
        });

        msg!("HTLC claimed: secret revealed, {} lamports transferred", amount);
        Ok(())
    }

    /// Refund SOL after timeout expires
    ///
    /// # Arguments
    /// * `hash_lock` - The hash_lock identifying the HTLC (20 bytes)
    pub fn refund(
        ctx: Context<Refund>,
        hash_lock: [u8; 20],
    ) -> Result<()> {
        let htlc = &mut ctx.accounts.htlc;
        let clock = Clock::get()?;

        // Verify HTLC state
        require!(!htlc.claimed, HTLCError::AlreadyClaimed);
        require!(!htlc.refunded, HTLCError::AlreadyRefunded);
        require!(htlc.hash_lock == hash_lock, HTLCError::HashMismatch);

        // Verify timeout has passed
        require!(
            clock.unix_timestamp >= htlc.timeout,
            HTLCError::TimeoutNotReached
        );

        // Verify caller is the sender
        require!(
            ctx.accounts.sender.key() == htlc.sender,
            HTLCError::NotSender
        );

        // Mark as refunded
        htlc.refunded = true;

        // Transfer SOL from HTLC PDA back to sender
        let amount = htlc.amount;
        **htlc.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.sender.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(Refunded {
            hash_lock,
            sender: ctx.accounts.sender.key(),
            amount,
        });

        msg!("HTLC refunded: {} lamports returned to sender", amount);
        Ok(())
    }

    /// Get HTLC details (view function)
    pub fn get_htlc_details(ctx: Context<GetHTLCDetails>) -> Result<HTLCDetailsResponse> {
        let htlc = &ctx.accounts.htlc;

        Ok(HTLCDetailsResponse {
            hash_lock: htlc.hash_lock,
            sender: htlc.sender,
            receiver: htlc.receiver,
            amount: htlc.amount,
            timeout: htlc.timeout,
            claimed: htlc.claimed,
            refunded: htlc.refunded,
        })
    }
}

// ============================================================================
// Account Structures
// ============================================================================

/// HTLC Account - stores the state of a single HTLC for native SOL
#[account]
#[derive(Default)]
pub struct HTLCAccount {
    /// HASH160 of the secret (20 bytes) = RIPEMD160(SHA256(secret))
    pub hash_lock: [u8; 20],
    /// Sender who locked the SOL
    pub sender: Pubkey,
    /// Receiver who can claim with the secret
    pub receiver: Pubkey,
    /// Amount of lamports locked
    pub amount: u64,
    /// Unix timestamp after which sender can refund
    pub timeout: i64,
    /// Whether SOL has been claimed
    pub claimed: bool,
    /// Whether SOL has been refunded
    pub refunded: bool,
    /// PDA bump seed
    pub bump: u8,
}

impl HTLCAccount {
    pub const SIZE: usize = 8 + // discriminator
        20 + // hash_lock (HASH160 = 20 bytes)
        32 + // sender
        32 + // receiver
        8 +  // amount
        8 +  // timeout
        1 +  // claimed
        1 +  // refunded
        1;   // bump
}

// ============================================================================
// Instruction Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(hash_lock: [u8; 20])]
pub struct Lock<'info> {
    #[account(
        init,
        payer = sender,
        space = HTLCAccount::SIZE,
        seeds = [b"htlc", hash_lock.as_ref()],
        bump
    )]
    pub htlc: Account<'info, HTLCAccount>,

    #[account(mut)]
    pub sender: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(hash_lock: [u8; 20])]
pub struct Claim<'info> {
    #[account(
        mut,
        seeds = [b"htlc", hash_lock.as_ref()],
        bump = htlc.bump
    )]
    pub htlc: Account<'info, HTLCAccount>,

    #[account(mut)]
    pub receiver: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(hash_lock: [u8; 20])]
pub struct Refund<'info> {
    #[account(
        mut,
        seeds = [b"htlc", hash_lock.as_ref()],
        bump = htlc.bump
    )]
    pub htlc: Account<'info, HTLCAccount>,

    #[account(mut)]
    pub sender: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetHTLCDetails<'info> {
    pub htlc: Account<'info, HTLCAccount>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct Locked {
    pub hash_lock: [u8; 20],
    pub sender: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub timeout: i64,
}

#[event]
pub struct Claimed {
    pub hash_lock: [u8; 20],
    pub receiver: Pubkey,
    pub secret: Vec<u8>,
    pub amount: u64,
}

#[event]
pub struct Refunded {
    pub hash_lock: [u8; 20],
    pub sender: Pubkey,
    pub amount: u64,
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct HTLCDetailsResponse {
    pub hash_lock: [u8; 20],
    pub sender: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub timeout: i64,
    pub claimed: bool,
    pub refunded: bool,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum HTLCError {
    #[msg("Invalid timeout: must be in the future")]
    InvalidTimeout,

    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,

    #[msg("Invalid secret: HASH160(secret) does not match hash_lock")]
    InvalidSecret,

    #[msg("HTLC has already been claimed")]
    AlreadyClaimed,

    #[msg("HTLC has already been refunded")]
    AlreadyRefunded,

    #[msg("Timeout has not been reached yet")]
    TimeoutNotReached,

    #[msg("Only the receiver can claim")]
    NotReceiver,

    #[msg("Only the sender can refund")]
    NotSender,

    #[msg("Hash lock mismatch")]
    HashMismatch,
}
