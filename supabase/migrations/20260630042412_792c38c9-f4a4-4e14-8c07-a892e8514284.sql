-- Treat admins as having the 'teacher' role implicitly.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        -- Admins implicitly have teacher capabilities.
        OR (_role = 'teacher'::public.app_role AND role = 'admin'::public.app_role)
      )
  )
$function$;