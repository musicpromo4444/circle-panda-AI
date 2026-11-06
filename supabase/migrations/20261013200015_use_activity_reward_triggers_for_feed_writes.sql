
create or replace function public.create_post(p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(trim(coalesce(p_body,'')))<1 or length(p_body)>5000 then raise exception 'Post must be between 1 and 5000 characters'; end if;
 insert into public.feed_posts(author_id,post_type,body,is_anonymous) values(v_uid,'post',trim(p_body),true) returning id into v_id;
 return v_id;
end;
$$;
create or replace function public.create_post_reply_secure(p_post_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(trim(coalesce(p_body,'')))<1 or length(p_body)>2000 then raise exception 'Reply must be between 1 and 2000 characters'; end if;
 if not exists(select 1 from public.feed_posts where id=p_post_id) then raise exception 'Post not found'; end if;
 insert into public.post_comments(post_id,author_id,body) values(p_post_id,v_uid,trim(p_body)) returning id into v_id;
 return v_id;
end;
$$;
