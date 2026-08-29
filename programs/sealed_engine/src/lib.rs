//! SEALED engine — trust infrastructure for provably fair games.
//!
//! Lifecycle of one seed cycle:
//!   commit_seed(sha256(seed))  → Active     (before any round is played)
//!   close_cycle(merkle_root…)  → Active+closed (rounds played, Merkle root + totals recorded)
//!   reveal_seed(seed)          → Revealed   (the chain itself checks sha256(seed) == commitment)
//!
//! A reveal with the wrong seed FAILS on-chain with `HashMismatch` — that failed transaction is
//! the demo's proof that not even the operator can fake a reveal.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

declare_id!("86EtE7RmAxHX6P62evx5XB94TmbFa5cG7ST4aXpDMRvs");

pub const MAX_SEED_LEN: usize = 64;

#[program]
pub mod sealed_engine {
    use super::*;

    /// Creates the Config and the global RtpStats. Run once per deployment.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.cycle_counter = 0;
        config.has_active = false;
        config.active_cycle = 0;
        config.bump = ctx.bumps.config;

        let rtp = &mut ctx.accounts.rtp_stats;
        rtp.total_rounds = 0;
        rtp.total_wagered_micros = 0;
        rtp.total_paid_micros = 0;
        rtp.bump = ctx.bumps.rtp_stats;
        Ok(())
    }

    /// Commit to a server seed BEFORE play: stores sha256(seed). One active cycle at a time.
    pub fn commit_seed(ctx: Context<CommitSeed>, seed_hash: [u8; 32]) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.has_active, SealedError::CycleStillActive);

        let cycle = &mut ctx.accounts.cycle;
        cycle.cycle_id = config.cycle_counter;
        cycle.seed_hash = seed_hash;
        cycle.status = CycleStatus::Active;
        cycle.closed = false;
        cycle.revealed_seed = Vec::new();
        cycle.committed_at = Clock::get()?.unix_timestamp; // never client-supplied
        cycle.revealed_at = 0;
        cycle.merkle_root = [0u8; 32];
        cycle.rounds = 0;
        cycle.wagered_micros = 0;
        cycle.paid_micros = 0;
        cycle.bump = ctx.bumps.cycle;

        config.active_cycle = cycle.cycle_id;
        config.has_active = true;
        config.cycle_counter = config.cycle_counter.checked_add(1).ok_or(SealedError::Overflow)?;

        emit!(SeedCommitted {
            cycle_id: cycle.cycle_id,
            seed_hash,
            committed_at: cycle.committed_at,
        });
        Ok(())
    }

    /// Close a cycle: record the Merkle root of every round played plus the money totals.
    pub fn close_cycle(
        ctx: Context<CloseCycle>,
        cycle_id: u64,
        merkle_root: [u8; 32],
        rounds: u64,
        wagered_micros: u64,
        paid_micros: u64,
    ) -> Result<()> {
        let cycle = &mut ctx.accounts.cycle;
        require!(cycle.cycle_id == cycle_id, SealedError::WrongCycle);
        require!(cycle.status == CycleStatus::Active, SealedError::CycleNotActive);
        require!(!cycle.closed, SealedError::CycleAlreadyClosed);

        cycle.merkle_root = merkle_root;
        cycle.rounds = rounds;
        cycle.wagered_micros = wagered_micros;
        cycle.paid_micros = paid_micros;
        cycle.closed = true;

        let rtp = &mut ctx.accounts.rtp_stats;
        rtp.total_rounds = rtp.total_rounds.checked_add(rounds).ok_or(SealedError::Overflow)?;
        rtp.total_wagered_micros = rtp
            .total_wagered_micros
            .checked_add(wagered_micros)
            .ok_or(SealedError::Overflow)?;
        rtp.total_paid_micros = rtp
            .total_paid_micros
            .checked_add(paid_micros)
            .ok_or(SealedError::Overflow)?;

        emit!(CycleClosed {
            cycle_id,
            merkle_root,
            rounds,
            wagered_micros,
            paid_micros,
        });
        Ok(())
    }

    /// THE core instruction. The chain recomputes sha256(seed) and refuses anything that does not
    /// match the commitment made before play. A wrong seed = a failed transaction, forever visible.
    pub fn reveal_seed(ctx: Context<RevealSeed>, cycle_id: u64, seed: Vec<u8>) -> Result<()> {
        let cycle = &mut ctx.accounts.cycle;
        require!(cycle.cycle_id == cycle_id, SealedError::WrongCycle);
        require!(cycle.status == CycleStatus::Active, SealedError::CycleNotActive);
        require!(cycle.closed, SealedError::CycleNotClosed);
        require!(!seed.is_empty() && seed.len() <= MAX_SEED_LEN, SealedError::SeedTooLong);

        let computed = hash(&seed).to_bytes();
        require!(computed == cycle.seed_hash, SealedError::HashMismatch);

        cycle.revealed_seed = seed;
        cycle.status = CycleStatus::Revealed;
        cycle.revealed_at = Clock::get()?.unix_timestamp;

        let config = &mut ctx.accounts.config;
        config.has_active = false;

        emit!(SeedRevealed {
            cycle_id,
            seed_hash: cycle.seed_hash,
            revealed_at: cycle.revealed_at,
            merkle_root: cycle.merkle_root,
            rounds: cycle.rounds,
        });
        Ok(())
    }
}

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    /// Next cycle id to allocate.
    pub cycle_counter: u64,
    pub has_active: bool,
    pub active_cycle: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum CycleStatus {
    Active,
    Revealed,
}

#[account]
#[derive(InitSpace)]
pub struct SeedCycle {
    pub cycle_id: u64,
    /// sha256(server_seed) — the commitment, stored BEFORE any round is played.
    pub seed_hash: [u8; 32],
    pub status: CycleStatus,
    /// close_cycle has recorded the Merkle root and totals.
    pub closed: bool,
    #[max_len(64)]
    pub revealed_seed: Vec<u8>,
    pub committed_at: i64,
    pub revealed_at: i64,
    pub merkle_root: [u8; 32],
    pub rounds: u64,
    pub wagered_micros: u64,
    pub paid_micros: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RtpStats {
    pub total_rounds: u64,
    /// Money is integer micro-units. RTP = total_paid / total_wagered, derived off-chain.
    pub total_wagered_micros: u64,
    pub total_paid_micros: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = authority, space = 8 + RtpStats::INIT_SPACE, seeds = [b"rtp"], bump)]
    pub rtp_stats: Account<'info, RtpStats>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitSeed<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority @ SealedError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = 8 + SeedCycle::INIT_SPACE,
        seeds = [b"cycle".as_ref(), config.cycle_counter.to_le_bytes().as_ref()],
        bump
    )]
    pub cycle: Account<'info, SeedCycle>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cycle_id: u64)]
pub struct CloseCycle<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority @ SealedError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"cycle".as_ref(), cycle_id.to_le_bytes().as_ref()], bump = cycle.bump)]
    pub cycle: Account<'info, SeedCycle>,
    #[account(mut, seeds = [b"rtp"], bump = rtp_stats.bump)]
    pub rtp_stats: Account<'info, RtpStats>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(cycle_id: u64)]
pub struct RevealSeed<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority @ SealedError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"cycle".as_ref(), cycle_id.to_le_bytes().as_ref()], bump = cycle.bump)]
    pub cycle: Account<'info, SeedCycle>,
    pub authority: Signer<'info>,
}

// ---------------------------------------------------------------------------------------------
// Events & errors
// ---------------------------------------------------------------------------------------------

#[event]
pub struct SeedCommitted {
    pub cycle_id: u64,
    pub seed_hash: [u8; 32],
    pub committed_at: i64,
}

#[event]
pub struct CycleClosed {
    pub cycle_id: u64,
    pub merkle_root: [u8; 32],
    pub rounds: u64,
    pub wagered_micros: u64,
    pub paid_micros: u64,
}

#[event]
pub struct SeedRevealed {
    pub cycle_id: u64,
    pub seed_hash: [u8; 32],
    pub revealed_at: i64,
    pub merkle_root: [u8; 32],
    pub rounds: u64,
}

#[error_code]
pub enum SealedError {
    #[msg("sha256(seed) does not match the on-chain commitment")]
    HashMismatch,
    #[msg("a cycle is still active; reveal it before committing a new seed")]
    CycleStillActive,
    #[msg("cycle is not active")]
    CycleNotActive,
    #[msg("cycle must be closed (merkle root recorded) before the seed is revealed")]
    CycleNotClosed,
    #[msg("cycle already closed")]
    CycleAlreadyClosed,
    #[msg("cycle id does not match the account")]
    WrongCycle,
    #[msg("seed must be 1..=64 bytes")]
    SeedTooLong,
    #[msg("only the authority may do this")]
    Unauthorized,
    #[msg("arithmetic overflow")]
    Overflow,
}
