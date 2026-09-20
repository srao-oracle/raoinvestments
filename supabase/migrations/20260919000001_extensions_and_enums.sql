-- M1 · Extensions + enums (foundational). pgmq/pg_cron are guarded so the schema still
-- applies in environments where those extensions aren't available.

create extension if not exists pgcrypto;
create extension if not exists vector;

do $$ begin
  create extension if not exists pgmq;
exception when others then raise notice 'pgmq unavailable: %', sqlerrm;
end $$;

do $$ begin
  create extension if not exists pg_cron;
exception when others then raise notice 'pg_cron unavailable: %', sqlerrm;
end $$;

create type asset_class           as enum ('stock', 'etf', 'index', 'option');
create type option_type           as enum ('call', 'put');
create type position_direction    as enum ('long', 'short');
create type position_status       as enum ('open', 'closed');
create type trade_action          as enum ('buy_to_open', 'sell_to_close', 'sell_to_open', 'buy_to_close');
create type fund_txn_type         as enum ('deposit', 'withdrawal', 'liquidation_request', 'dividend', 'interest', 'fee', 'assignment_cash', 'adjustment');
create type fund_txn_status       as enum ('pending', 'approved', 'completed', 'cancelled', 'failed');
create type opportunity_status    as enum ('candidate', 'under_investigation', 'proposed', 'invested', 'closed', 'rejected');
create type opportunity_direction as enum ('long_stock', 'long_call', 'long_put', 'covered_call', 'csp');
create type agent_role            as enum ('strategist', 'scout', 'research', 'red_team', 'portfolio_manager');
create type message_role          as enum ('user', 'assistant', 'system');
create type run_status            as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type tool_call_status      as enum ('ok', 'error', 'timeout');
create type scout_status          as enum ('new', 'promoted', 'dismissed');
create type memory_kind           as enum ('thesis', 'lesson', 'observation', 'fact', 'reflection');
