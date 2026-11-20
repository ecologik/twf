-- Tag each load model entry with a map practice type (cover crop, streambank...),
-- so the Map section can total sediment, phosphorus and nitrogen per practice type.
-- Deleting a practice type leaves its entries untagged.

alter table public.load_model_entries
  add column practice_type text references public.practice_types (id) on delete set null on update cascade;

create index load_model_entries_practice_type_idx on public.load_model_entries (practice_type);

grant update (practice_type) on public.load_model_entries to authenticated;
